#!/usr/bin/env node
/**
 * @typedef {RequestOptions} HttpRequestOptions
 * @property {*} data
 * @property {number} [retries=3]
 * @property {(error: Error) => boolean} [retryOn]
 * @property {<T>(body: string) => T} [transform]
 */

/**
 * @typedef {HttpRequestOptions} N8nHttpRequestOptions
 * @property {string} [apiKey]
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
  let { data, retryOn, retries, transform } = options
  /** @type {HttpRequestOptions} */
  const params = JSON.parse(JSON.stringify(options))

  if (data && typeof data === 'object') {
    data = JSON.stringify(data)

    params.headers ??= {}
    params.headers['Content-Type'] = 'application/json'
    params.headers['Content-Length'] = Buffer.byteLength(data)
  }

  const make = () => new Promise((resolve, reject) => {
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

  if (retryOn) {
    const retryTimes = retries ?? 3

    for (let retry = 1; retry < retryTimes; retry++) {
      try {
        // Awaiting internally to assess the error.
        return await make()
      } catch (error) {
        if (retryOn(error)) {
          console.warn(
            `Request failed, retrying (${retry} out of ${retryTimes})...`,
            params,
          )
          // Give it some time to put itself together.
          await sleep(300)
        } else {
          throw error
        }
      }
    }
  }

  // The retries loop make one iteration less than requested when
  // the `retryOn` is set. This call compensates the missing retry.
  return make()
}

/**
 * @param {N8nHttpRequestOptions} options
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
  let { data: owner } = await httpN8nRequest(
    {
      path: '/rest/login',
      data: {
        emailOrLdapLoginId: N8N_OWNER_EMAIL,
        password: N8N_OWNER_PASSWORD,
      },
    }
  )

  // The N8N creates a user entry by default but all values are empty.
  if (!owner?.email) {
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
  const retryOn = (error) => {
    return (
      // At some point it fails with `socket hang up`.
      error.code === 'ECONNRESET'
    )
  }

  for (const filePath of await importN8nFiles('workflows')) {
    const { id } = loadJsonFile(filePath)
    const workflow = await httpN8nRequest(
      {
        path: `/api/v1/workflows/${id}/activate`,
        apiKey,
        retryOn,
      },
    )

    if (workflow.message) {
      console.error(workflow.message)
    } else {
      console.info(
        `Workflow "${workflow.name}" (ID: ${workflow.id}) set to ${workflow.active ? '' : 'in'}active.`,
      )
    }
  }
}

/**
 * @param {('workflows'|'credentials')} type
 * @param {string[]} [ids]
 */
async function exportN8nFiles(type, ids) {
  const dir = `${dataDir}/${type}`
  // Singular word form.
  const kind = type.slice(0, -1)
  const command = type.endsWith('ws')
    ? kind
    : type
  const args = (() => {
    const list = [
      '--separate',
      // There's no way to own the filename.
      `--output "${dir}"`,
    ]

    if (type === 'credentials') {
      list.unshift('--decrypted')
    }

    return list.join(' ')
  })()
  const fn = (id, filename) => {
    const exportFilePath = `${dir}/${id}.json`

    console.info(
      `Exporting ${kind} "${id}"...`,
    )

    try {
      execSync(
        `n8n export:${command} ${args} --id "${id}"`,
        {
          stdio: 'inherit',
        },
      )
    } catch {
      // Command failed.
      return
    }

    const data = loadJsonFile(exportFilePath)

    writeFileSync(
      `${dir}/${filename || `${data.name}.json`}`,
      // Ensure the top-level keys are always in the same order.
      JSON.stringify(sortObjectKeys(data), null, 2),
    )

    rmSync(exportFilePath)
  }

  const filenames = globSync(`${dir}/*.json`).reduce(
    (accumulator, path) => {
      // Avoid parsing as the file can be a template
      // with the handlebars syntax (invalid JSON).
      const match = loadFile(path).match(/"id":\s+?"([^"]+)"/)

      if (match) {
        accumulator[match[1]] = basename(path)
      } else {
        console.error('Unable to find the "id" property inside', path)
      }

      return accumulator
    },
    {},
  )

  if (ids?.length) {
    for (const id of ids) {
      // Use the filename of an existing export if available.
      fn(id, filenames[id])
    }
  } else {
    for (const [id, filename] of Object.entries(filenames)) {
      fn(id, filename)
    }
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
  configure() {
    // Exists only to ensure the owner account is configured (done
    // by the logic that runs before any command).
  },
  async import(ownerApiKey) {
    await importN8nFiles('credentials', templateCredentialsFiles)
    await importWorkflows(ownerApiKey)
  },
  async export() {
    const type = process.argv[3]

    if (!type) {
      throw new Error('The entity type must be provided.')
    }

    await exportN8nFiles(type, process.argv.slice(4))
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
