#!/usr/bin/env node
/**
 * @typedef {RequestOptions} HttpRequestOptions
 * @property {*} data
 * @property {<T>(body: string) => T} [transform]
 */

import { execSync } from 'node:child_process'
import { lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { basename, sep as directorySeparator } from 'node:path'

import Handlebars from 'handlebars'
import { globSync } from 'glob'
import sqlite3 from 'sqlite3'
import jwt from 'jsonwebtoken'

const ownerApiKeyLabel = 'local'
const configDir = '/home/node/.n8n'
const dataDir = `${configDir}/host-data`
const command = process.argv[2]
const db = new sqlite3.Database(`${configDir}/database.sqlite`)
const {
  ADDR_LOCALHOST,
  N8N_PORT,
  N8N_OWNER_EMAIL,
  N8N_OWNER_PASSWORD,
  N8N_API_KEY_ISSUER,
  N8N_API_KEY_AUDIENCE,
  N8N_USER_MANAGEMENT_JWT_SECRET,
} = process.env

if (!lstatSync(dataDir).isDirectory()) {
  throw new Error('The N8N data directory must be provided.')
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * @param {string} path
 *
 * @return {string}
 */
function loadFile(path) {
  return readFileSync(path).toString('utf-8')
}

/**
 * @param {string} path
 *
 * @return {*}
 */
function loadJsonFile(path) {
  return JSON.parse(loadFile(path))
}

/**
 * @template {string} Prefix
 * @template {Record<string, *>} Source
 *
 * @param {Prefix} prefix
 * @param {Source} source
 *
 * @return {Record<`${Prefix}${keyof Source}`, Source[keyof Source]>}
 */
function prefixObjectKeys(prefix, source) {
  return Object
    .entries(source)
    .reduce(
      (accumulator, [key, value]) => {
        accumulator[`${prefix}${key}`] = value

        return accumulator
      },
      {},
    )
}

/**
 * @template {Record<string, *>} Source
 *
 * @param {Source} source
 *
 * @return {Source}
 */
function sortObjectKeys(source) {
  return Object
    .keys(source)
    .sort()
    .reduce(
      (accumulator, key) => {
        accumulator[key] = source[key]

        return accumulator
      },
      {},
    )
}

/**
 * @param {string} query
 * @param {Object} params
 *
 * @return {Promise<Object>}
 */
async function sqliteGet(query, params) {
  return new Promise((resolve, reject) => {
    db.get(query, params, (error, row) => {
      if (error) {
        reject(error)
      } else {
        resolve(row)
      }
    })
  })
}

/**
 * @param {HttpRequestOptions} options
 */
async function httpRequest(options) {
  return new Promise((resolve, reject) => {
    let { data, transform } = options
    /** @type {HttpRequestOptions} */
    const params = JSON.parse(JSON.stringify(options))

    if (data && typeof data === 'object') {
      data = JSON.stringify(data)

      params.headers ??= {}
      params.headers['Content-Type'] = 'application/json'
      params.headers['Content-Length'] = Buffer.byteLength(data)
    }

    const request = http.request(
      params,
      (response) => {
        let responseData = ''

        response.on('data', (chunk) => {
          responseData += chunk
        })

        response.on('end', () => {
          try {
            resolve(transform ? transform(responseData) : responseData)
          } catch (error) {
            reject(error)
          }
        })
      }
    )

    request.on('error', reject)

    if (data) {
      request.write(data)
    }

    request.end()
  })
}

/**
 * @param {HttpRequestOptions & {apiKey?: string}} options
 */
async function httpN8nRequest(options) {
  const headers = {}
  const { apiKey, ...params } = options

  if (apiKey) {
    headers['X-N8N-API-KEY'] = apiKey
  }

  return httpRequest(
    {
      method: 'POST',
      ...params,
      hostname: ADDR_LOCALHOST,
      port: N8N_PORT,
      headers: {
        ...(params.headers || {}),
        ...headers,
      },
      transform: JSON.parse,
    },
  )
}

async function n8nIsReady() {
  let booting = true

  while (booting) {
    try {
      // When not booted the request doesn't return a JSON
      // so the `JSON.parse()` inside conveniently throws.
      // This is only needed at the container startup.
      await httpN8nRequest({ path: '/rest/owner/setup' })
      booting = false
    } catch {
      console.info('Waiting for N8N to start...')
      await sleep(2000)
    }
  }
}

/**
 * @return {Promise<string>}
 */
async function getOwnerUuid() {
  let owner = await sqliteGet(
    'SELECT * FROM user WHERE role = $role',
    {
      $role: 'global:owner',
    },
  )

  // The N8N creates a user entry by default but all values are empty.
  if (!owner.email) {
    const response = await httpN8nRequest(
      {
        path: '/rest/owner/setup',
        data: {
          email: N8N_OWNER_EMAIL,
          password: N8N_OWNER_PASSWORD,
          firstName: 'Node',
          lastName: 'Mation',
        },
      },
    )

    owner = response.data
  }

  return owner.id
}

/**
 * @param {string} ownerId
 *
 * @return {Promise<string>}
 */
async function getOwnerApiKey(ownerId) {
  let record = await sqliteGet(
    'SELECT * FROM user_api_keys WHERE label = $label AND userId = $ownerId',
    {
      $label: ownerApiKeyLabel,
      $ownerId: ownerId,
    },
  )

  if (!record) {
    record = {
      id: 'ahkwtWHnFYuulV23',
      userId: ownerId,
      label: ownerApiKeyLabel,
      createdAt: '2025-06-02 15:53:17.424',
      updatedAt: '2025-06-02 15:53:17.424',
      // See:
      // - https://github.com/n8n-io/n8n/blob/40de4ed91c00fa366c131363363729592d1ab57a/packages/cli/src/services/public-api-key.service.ts#L145-L151
      // - https://github.com/n8n-io/n8n/blob/23ce60d6466b387df50688c29c0db63c899922c0/packages/cli/src/services/jwt.service.ts#L27-L29
      apiKey: jwt.sign(
        {
          sub: ownerId,
          iss: N8N_API_KEY_ISSUER,
          aud: N8N_API_KEY_AUDIENCE,
        },
        N8N_USER_MANAGEMENT_JWT_SECRET,
      ),
      scopes: JSON.stringify([
        'user:read',
        'user:list',
        'user:create',
        'user:changeRole',
        'user:delete',
        'sourceControl:pull',
        'securityAudit:generate',
        'project:create',
        'project:update',
        'project:delete',
        'project:list',
        'variable:create',
        'variable:delete',
        'variable:list',
        'tag:create',
        'tag:read',
        'tag:update',
        'tag:delete',
        'tag:list',
        'workflowTags:update',
        'workflowTags:list',
        'workflow:create',
        'workflow:read',
        'workflow:update',
        'workflow:delete',
        'workflow:list',
        'workflow:move',
        'workflow:activate',
        'workflow:deactivate',
        'execution:delete',
        'execution:read',
        'execution:list',
        'credential:create',
        'credential:move',
        'credential:delete',
      ]),
    }

    db.run(
      `INSERT INTO user_api_keys
         (id, userId, label, apiKey, createdAt, updatedAt, scopes)
       VALUES
         ($id, $userId, $label, $apiKey, $createdAt, $updatedAt, $scopes)`,
      prefixObjectKeys('$', record),
    )
  }

  return record.apiKey
}

/**
 * @param {('workflows'|'credentials')} type
 * @param {((filePaths: string[]) => Promise<string>)} [processFiles]
 *
 * @return {Promise<string[]>}
 */
async function importN8nFiles(type, processFiles) {
  const dir = `${dataDir}/${type}`
  const filePaths = globSync(`${dir}/*.json`)

  if (filePaths.length > 0) {
    const command = type.endsWith('ws')
      // Singular word form.
      ? type.slice(0, -1)
      : type

    execSync(
      `n8n import:${command} --separate --input ${await processFiles?.(filePaths) || dir}`,
      {
        stdio: 'inherit',
      },
    )
  }

  return filePaths.reverse()
}

async function importWorkflows(apiKey) {
  for (const filePath of await importN8nFiles('workflows')) {
    const { id } = loadJsonFile(filePath)
    const workflow = await httpN8nRequest(
      {
        path: `/api/v1/workflows/${id}/activate`,
        apiKey,
      },
    )

    console.info(
      `The workflow "${workflow.name}" set to ${workflow.active ? '' : 'in'}active.`,
    )
  }
}

async function exportWorkflows() {
  const dir = `${dataDir}/workflows`

  for (const path of globSync(`${dir}/*.json`)) {
    const { id, name } = loadJsonFile(path)
    const exportFilePath = `${dir}/${id}.json`

    console.info(
      `Exporting workflow "${name}"...`,
    )

    execSync(
      // There's no way to own the filename.
      `n8n export:workflow --separate --pretty --id "${id}" --output "${dir}"`,
      {
        stdio: 'inherit',
      },
    )

    writeFileSync(
      `${dir}/${basename(path)}`,
      // Ensure the top-level keys are always in the same order.
      JSON.stringify(sortObjectKeys(loadJsonFile(exportFilePath)), null, 2),
    )

    rmSync(exportFilePath)
  }
}

/**
 * @param {string[]} filePaths
 *
 * @return {Promise<string>}
 *   The new temp dir with templated credentials.
 */
async function templateCredentialsFiles(filePaths) {
  // Make a new dir for the files created out of templates
  const dir = mkdtempSync(tmpdir() + directorySeparator)

  for (const filePath of filePaths) {
    writeFileSync(
      `${dir}/${basename(filePath)}`,
      // Replace variables with actual values.
      Handlebars.compile(loadFile(filePath))(process.env),
    )
  }

  return dir
}

const commands = {
  async configure(ownerApiKey) {
    await importN8nFiles('credentials', templateCredentialsFiles)
    await importWorkflows(ownerApiKey)
  },
  async export() {
    await exportWorkflows()
  },
}

if (command in commands) {
  await n8nIsReady()

  const ownerUuid = await getOwnerUuid()
  const ownerApiKey = await getOwnerApiKey(ownerUuid)

  await commands[command](ownerApiKey)
} else {
  throw new Error(`The "${command}" does not exist!`)
}
