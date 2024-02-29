'use strict'

const fetch = require('@zeit/fetch-retry')(require('node-fetch'))
const qs = require('qs')
const jws = require('jws')
const debug = require('debug')('@skycatch/node-skyapi-sdk')

const print = {
  headers: (res) => ((
      keys = Array.from(res.headers.keys()),
      values = Array.from(res.headers.values())) =>
    keys.reduce((all, key, index) =>
      (all[key] = values[index], all), {})
  )(),
  request: ({
    requestId,
    method,
    url,
    headers,
    body
  }) => {
    if (!/@skycatch\//.test(process.env.DEBUG)) {
      return
    }
    if (process.env.NODE_ENV === 'test') {
      debug.extend('request')(method, url)
      debug.extend('request')(headers)
      debug.extend('request')(body ? JSON.parse(body) : undefined)
    } else {
      console.log(JSON.stringify({
        requestId,
        type: 'skyapi',
        method,
        url,
        headers,
        body: body ? JSON.parse(body) : undefined
      }))
    }
  },
  response: ({
    requestId,
    res,
    body
  }) => {
    if (!/@skycatch\//.test(process.env.DEBUG)) {
      return
    }
    if (process.env.NODE_ENV === 'test') {
      debug.extend('response')(res.status, res.statusText)
      debug.extend('response')(print.headers(res))
      debug.extend('response')(body)
    } else {
      console.log(JSON.stringify({
        requestId,
        type: 'skyapi',
        status: `${res.status} ${res.statusText}`,
        headers: print.headers(res),
        body
      }))
    }
  }
}

/*
  env      : dev, stage, prod
  origin   : http://localhost:3000
  domain   : staging-gemba.skycatch.com, staging-api.skycatch.com
  tenant   : skycatch-development.auth0.com, skycatch-staging.auth0.com
  key      : the app key
  secret   : the app secret
  audience : stage.datahub-api.skycatch.net/data_processing
  token    : access token to use instead of acquiring one using the key and the secret
  version  : the SkyAPI version to use - 2, 1
*/

module.exports = function SkyAPI({
  env,
  origin,
  domain,
  tenant,
  key,
  secret,
  audience,
  token,
  version
}) {
  const api = {}

  api.refresh = async () => {
    const method = 'POST'
    const url = (origin || `https://${tenant}`) + '/v1/oauth/token'
    const headers = {
      'Content-Type': 'application/json'
    }
    const body = JSON.stringify({
      grant_type: 'client_credentials',
      client_id: key,
      client_secret: secret,
      audience
    })

    print.request({
      url,
      method,
      headers,
      body
    })
    const res = await fetch(url, {
      method,
      headers,
      body
    })
    const json = await res.json()
    print.response({
      res,
      body: json
    })

    if (/^(4|5)/.test(res.status)) {
      throw new Error(JSON.stringify(json))
    }

    return json.access_token
  }

  api.request = async ({
    method,
    path,
    query,
    body,
    security,
    options = {}
  }) => {
    let headers = {}

    if (env) {
      headers['x-dh-env'] = env
    }

    if (security) {
      if (!token && key && secret) {
        token = await api.refresh()
      }

      if (token) {
        const {
          payload: {
            exp
          }
        } = jws.decode(token)
        if (Date.now() >= exp * 1000) {
          token = await api.refresh()
        }
        headers.authorization = `Bearer ${token}`
      }
    }

    if (Object.keys(query).length) {
      path += `?${qs.stringify(query, {arrayFormat: 'repeat'})}`
    }

    if (/put|post|patch|delete/i.test(method)) {
      headers['content-type'] = 'application/json'
      body = JSON.stringify(body)
    } else {
      body = undefined
    }

    const url = (origin || `https://${domain}`) + path
    const requestId = options.requestId
    delete options.requestId
    options = {
      ...options,
      method,
      headers,
      body
    }

    print.request({
      requestId,
      url,
      method,
      headers,
      body
    })
    const res = await fetch(url, options)
    const json = await res.json()
    print.response({
      requestId,
      res,
      body: json
    })

    if (/^(4|5)/.test(res.status)) {
      throw new Error(JSON.stringify(json))
    } else {
      return json
    }
  }

  // v2 methods
  /**
   * Creates a transform matrix for CCRS localization
   * Parses a localization file to create a new transform matrix to be used in a compound coordinate reference system (CCRS)
   * @method
   * @name createCCRSLocalization
   * @param (number) version - The version of the localization library to use when calculating the transform matrix
   * @param (string) file - Localization data as base64 encoded binary
   * @param (string) units - Parses a localization file to create a new transform matrix to be used in a compound coordinate reference system (CCRS)
   */

  api.createCCRSLocalization = async (params = {}, options = {}) => {
    let method = 'post'.toUpperCase()
    let path = `/v${version || 2}` + '/ccrs/localization'
    let query = {}
    let body = {}
    let security = false

    if (params['version'] !== undefined) {
      query['version'] = params['version']
    }

    if (params['file'] !== undefined) {
      body['file'] = params['file']
    }

    if (params['units'] !== undefined) {
      body['units'] = params['units']
    }

    return api.request({
      method,
      path,
      query,
      body,
      security,
      options
    })
  }
  /**
   * Create STS credentials for use in S3 File Manager
   * Create STS credentials for use in S3 File Manager
   * @method
   * @name createFileManagerCredentials
   * @param (string) authorization - Organization's access token
   * @param (string) site - Site ID
   * @param (string) dataset - Dataset UUID
   * @param (string) processing - Processing UUID
   * @param (string) export - Export UUID
   * @param (string) overlay - Overlay UUID
   * @param (number) expiration - Credentials expiration in seconds
   */

  api.createFileManagerCredentials = async (params = {}, options = {}) => {
    let method = 'post'.toUpperCase()
    let path = `/v${version || 2}` + '/credentials/filemanager'
    let query = {}
    let body = {}
    let security = true

    if (params['site'] !== undefined) {
      body['site'] = params['site']
    }

    if (params['dataset'] !== undefined) {
      body['dataset'] = params['dataset']
    }

    if (params['processing'] !== undefined) {
      body['processing'] = params['processing']
    }

    if (params['export'] !== undefined) {
      body['export'] = params['export']
    }

    if (params['overlay'] !== undefined) {
      body['overlay'] = params['overlay']
    }

    if (params['expiration'] !== undefined) {
      body['expiration'] = params['expiration']
    }

    return api.request({
      method,
      path,
      query,
      body,
      security,
      options
    })
  }
  /**
   * Creates a dataset
   * Creates a new dataset in the customer's account
   * @method
   * @name createDataset
   * @param (string) authorization - Organization's access token
   * @param (string) token - User access token
   * @param (string) name - Dataset name
   * @param (string) sourceId -  The source ID in the app creating the dataset. If passed in it will be used as the name for the s3 object dir in place of the DUUID as long a it does not already exist. 
   * @param (string) type - The dataset type
   * @param (object) metadata - Metadata about the dataset
   * @param (number) duration - Upload duration in hours
   */

  api.createDataset = async (params = {}, options = {}) => {
    let method = 'post'.toUpperCase()
    let path = `/v${version || 2}` + '/datasets'
    let query = {}
    let body = {}
    let security = true

    if (params['token'] !== undefined) {
      query['token'] = params['token']
    }

    if (params['name'] !== undefined) {
      body['name'] = params['name']
    }

    if (params['sourceId'] !== undefined) {
      body['sourceId'] = params['sourceId']
    }

    if (params['type'] !== undefined) {
      body['type'] = params['type']
    }

    if (params['metadata'] !== undefined) {
      body['metadata'] = params['metadata']
    }

    if (params['duration'] !== undefined) {
      body['duration'] = params['duration']
    }

    return api.request({
      method,
      path,
      query,
      body,
      security,
      options
    })
  }
  /**
   * Get a dataset
   * Get a dataset by id from the customer's account
   * @method
   * @name getDataset
   * @param (string) uuid - Dataset identifier
   * @param (boolean) exif - Fetch additional EXIF information for RAW photos in this dataset.
   * @param (boolean) credentials - Generate upload credentials
   * @param (number) duration - Upload credentials duration in hours
   */

  api.getDataset = async (params = {}, options = {}) => {
    let method = 'get'.toUpperCase()
    let path = `/v${version || 2}` + '/datasets/{uuid}'
    let query = {}
    let body = {}
    let security = true

    if (params['uuid'] !== undefined) {
      path = path.replace('{' + 'uuid' + '}', params['uuid'])
    }

    if (params['exif'] !== undefined) {
      query['exif'] = params['exif']
    }

    if (params['credentials'] !== undefined) {
      query['credentials'] = params['credentials']
    }

    if (params['duration'] !== undefined) {
      query['duration'] = params['duration']
    }

    return api.request({
      method,
      path,
      query,
      body,
      security,
      options
    })
  }
  /**
   * Updates a datasets
   * Updates the dataset name
   * @method
   * @name updateDataset
   * @param (string) uuid - Dataset identifier
   * @param (string) name - Dataset name
   */

  api.updateDataset = async (params = {}, options = {}) => {
    let method = 'patch'.toUpperCase()
    let path = `/v${version || 2}` + '/datasets/{uuid}'
    let query = {}
    let body = {}
    let security = true

    if (params['uuid'] !== undefined) {
      path = path.replace('{' + 'uuid' + '}', params['uuid'])
    }

    if (params['name'] !== undefined) {
      body['name'] = params['name']
    }

    return api.request({
      method,
      path,
      query,
      body,
      security,
      options
    })
  }
  /**
   * Get Photo Metadata
   * Get Metadata for a RAW Drone Photo in a customer's account
   * @method
   * @name getDatasetPhoto
   * @param (string) authorization - M2M access token
   * @param (string) uuid - The dataset identifier
   * @param (string) id - The photo identifier
   */

  api.getDatasetPhoto = async (params = {}, options = {}) => {
    let method = 'get'.toUpperCase()
    let path = `/v${version || 2}` + '/datasets/{uuid}/photos/{id}'
    let query = {}
    let body = {}
    let security = true

    if (params['uuid'] !== undefined) {
      path = path.replace('{' + 'uuid' + '}', params['uuid'])
    }

    if (params['id'] !== undefined) {
      path = path.replace('{' + 'id' + '}', params['id'])
    }

    return api.request({
      method,
      path,
      query,
      body,
      security,
      options
    })
  }
  /**
   * Gets a list of jobs
   * Gets a list of jobs
   * @method
   * @name listProcessingJobs
   * @param (string) uuid - Dataset ID
   */

  api.listProcessingJobs = async (params = {}, options = {}) => {
    let method = 'get'.toUpperCase()
    let path = `/v${version || 2}` + '/datasets/{uuid}/processes'
    let query = {}
    let body = {}
    let security = true

    if (params['uuid'] !== undefined) {
      path = path.replace('{' + 'uuid' + '}', params['uuid'])
    }

    return api.request({
      method,
      path,
      query,
      body,
      security,
      options
    })
  }
  /**
   * Start processing a dataset
   * Initiates the processing of images or a point cloud in the dataset
   * @method
   * @name createProcessingJob
   * @param (string) uuid - Dataset ID
   * @param (boolean) dryrun - Create processing job entry without starting the job
   * @param (string) type - Type of process to run
   * @param (string) sourceData - Type of input images
   * @param (object) ccrs - The definition of the custom coordinate reference system used to generate outputs and parse inputs
   * @param (object) options - Option flags to trigger custom behavior
   * @param (string) containerName - Name of the partner storage container to sync back
   * @param (string) prefix - Prefix for the partner storage container to sync back
   * @param (string) pointCloudColumnOrder - The column order of a point cloud. Only used for TXT point clouds
   * @param (string) connectionString - Container string required to identify the repository source. This is only needed for syncing
   * @param (string) resourceOwnerId - Description
   * @param (string) accessToken - Description
   * @param (string) refreshToken - Description
   * @param (string) syncType - Description
   * @param (object) metadata - Metadata
   * @param (string) revision - Pipeline revision to run
   */

  api.createProcessingJob = async (params = {}, options = {}) => {
    let method = 'post'.toUpperCase()
    let path = `/v${version || 2}` + '/datasets/{uuid}/processes'
    let query = {}
    let body = {}
    let security = true

    if (params['uuid'] !== undefined) {
      path = path.replace('{' + 'uuid' + '}', params['uuid'])
    }

    if (params['dryrun'] !== undefined) {
      body['dryrun'] = params['dryrun']
    }

    if (params['type'] !== undefined) {
      body['type'] = params['type']
    }

    if (params['sourceData'] !== undefined) {
      body['sourceData'] = params['sourceData']
    }

    if (params['ccrs'] !== undefined) {
      body['ccrs'] = params['ccrs']
    }

    if (params['options'] !== undefined) {
      body['options'] = params['options']
    }

    if (params['containerName'] !== undefined) {
      body['containerName'] = params['containerName']
    }

    if (params['prefix'] !== undefined) {
      body['prefix'] = params['prefix']
    }

    if (params['pointCloudColumnOrder'] !== undefined) {
      body['pointCloudColumnOrder'] = params['pointCloudColumnOrder']
    }

    if (params['connectionString'] !== undefined) {
      body['connectionString'] = params['connectionString']
    }

    if (params['resourceOwnerId'] !== undefined) {
      body['resourceOwnerId'] = params['resourceOwnerId']
    }

    if (params['accessToken'] !== undefined) {
      body['accessToken'] = params['accessToken']
    }

    if (params['refreshToken'] !== undefined) {
      body['refreshToken'] = params['refreshToken']
    }

    if (params['syncType'] !== undefined) {
      body['syncType'] = params['syncType']
    }

    if (params['metadata'] !== undefined) {
      body['metadata'] = params['metadata']
    }

    if (params['revision'] !== undefined) {
      body['revision'] = params['revision']
    }

    return api.request({
      method,
      path,
      query,
      body,
      security,
      options
    })
  }
  /**
   * List dataset validations
   * Get a list of known validations for a specific dataset
   * @method
   * @name getDatasetValidations
   * @param (string) uuid - Dataset ID
   * @param (string) type - Validation type
   * @param (string) authorization - Organization's access token
   */

  api.getDatasetValidations = async (params = {}, options = {}) => {
    let method = 'get'.toUpperCase()
    let path = `/v${version || 2}` + '/datasets/{uuid}/validations'
    let query = {}
    let body = {}
    let security = true

    if (params['uuid'] !== undefined) {
      path = path.replace('{' + 'uuid' + '}', params['uuid'])
    }

    if (params['type'] !== undefined) {
      query['type'] = params['type']
    }

    return api.request({
      method,
      path,
      query,
      body,
      security,
      options
    })
  }
  /**
   * Create validations for given dataset
   * Initiates the validation of images and/or ccrs in the dataset
   * @method
   * @name createDatasetValidations
   * @param (string) uuid - Dataset ID
   * @param (string) authorization - Organization's access token
   * @param (string) type - Type of validation to run
   * @param (object) data - Validation input such as images or ccrs
   */

  api.createDatasetValidations = async (params = {}, options = {}) => {
    let method = 'post'.toUpperCase()
    let path = `/v${version || 2}` + '/datasets/{uuid}/validations'
    let query = {}
    let body = {}
    let security = true

    if (params['uuid'] !== undefined) {
      path = path.replace('{' + 'uuid' + '}', params['uuid'])
    }

    if (params['type'] !== undefined) {
      body['type'] = params['type']
    }

    if (params['data'] !== undefined) {
      body['data'] = params['data']
    }

    return api.request({
      method,
      path,
      query,
      body,
      security,
      options
    })
  }
  /**
   * Delete datasets file
   * Backup file as .del and remove the original
   * @method
   * @name deleteDatasetFile
   * @param (string) uuid - Dataset ID
   * @param (string) id - File ID
   * @param (string) authorization - Organization's access token
   */

  api.deleteDatasetFile = async (params = {}, options = {}) => {
    let method = 'delete'.toUpperCase()
    let path = `/v${version || 2}` + '/datasets/{uuid}/files/{id}'
    let query = {}
    let body = {}
    let security = true

    if (params['uuid'] !== undefined) {
      path = path.replace('{' + 'uuid' + '}', params['uuid'])
    }

    if (params['id'] !== undefined) {
      path = path.replace('{' + 'id' + '}', params['id'])
    }

    return api.request({
      method,
      path,
      query,
      body,
      security,
      options
    })
  }
  /**
   * Delete datasets files
   * Find files of given type, back them up as .del and remove the original files
   * @method
   * @name deleteDatasetFiles
   * @param (string) uuid - Dataset ID
   * @param (string) type - File type
   * @param (string) authorization - Organization's access token
   */

  api.deleteDatasetFiles = async (params = {}, options = {}) => {
    let method = 'delete'.toUpperCase()
    let path = `/v${version || 2}` + '/datasets/{uuid}/files'
    let query = {}
    let body = {}
    let security = true

    if (params['uuid'] !== undefined) {
      path = path.replace('{' + 'uuid' + '}', params['uuid'])
    }

    if (params['type'] !== undefined) {
      query['type'] = params['type']
    }

    return api.request({
      method,
      path,
      query,
      body,
      security,
      options
    })
  }
  /**
   * Gets design files
   * Retrieves processed design files for a dataset
   * @method
   * @name getDesignFiles
   * @param (string) uuid - Designfile identifier
   */

  api.getDesignFiles = async (params = {}, options = {}) => {
    let method = 'get'.toUpperCase()
    let path = `/v${version || 2}` + '/designfiles/{uuid}'
    let query = {}
    let body = {}
    let security = true

    if (params['uuid'] !== undefined) {
      path = path.replace('{' + 'uuid' + '}', params['uuid'])
    }

    return api.request({
      method,
      path,
      query,
      body,
      security,
      options
    })
  }
  /**
   * Get latest version info
   * Get latest version information for a given device id
   * @method
   * @name getDeviceRelease
   * @param (string) uuid - Id of the device to determine latests software version
   */

  api.getDeviceRelease = async (params = {}, options = {}) => {
    let method = 'get'.toUpperCase()
    let path = `/v${version || 2}` + '/edge1/{uuid}/version'
    let query = {}
    let body = {}
    let security = false

    if (params['uuid'] !== undefined) {
      path = path.replace('{' + 'uuid' + '}', params['uuid'])
    }

    return api.request({
      method,
      path,
      query,
      body,
      security,
      options
    })
  }
  /**
   * Send email
   * Send email
   * @method
   * @name sendEmail
   * @param (string) api_key - API Key
   * @param (string) method - The sending method name
   * @param (string) from - Email sender
   * @param (string) to - Email recipient
   * @param (string) subject - Email subject
   * @param (string) html - Email body as HTML
   * @param (string) text - Email body as text
   * @param (string) template - Template name
   * @param (object) data - Template data
   * @param (array) destinations - Bulk template destinations
   */

  api.sendEmail = async (params = {}, options = {}) => {
    let method = 'post'.toUpperCase()
    let path = `/v${version || 2}` + '/email/send'
    let query = {}
    let body = {}
    let security = true

    if (params['api_key'] !== undefined) {
      query['api_key'] = params['api_key']
    }

    if (params['method'] !== undefined) {
      body['method'] = params['method']
    }

    if (params['from'] !== undefined) {
      body['from'] = params['from']
    }

    if (params['to'] !== undefined) {
      body['to'] = params['to']
    }

    if (params['subject'] !== undefined) {
      body['subject'] = params['subject']
    }

    if (params['html'] !== undefined) {
      body['html'] = params['html']
    }

    if (params['text'] !== undefined) {
      body['text'] = params['text']
    }

    if (params['template'] !== undefined) {
      body['template'] = params['template']
    }

    if (params['data'] !== undefined) {
      body['data'] = params['data']
    }

    if (params['destinations'] !== undefined) {
      body['destinations'] = params['destinations']
    }

    return api.request({
      method,
      path,
      query,
      body,
      security,
      options
    })
  }
  /**
   * Export Job
   * Export Job
   * @method
   * @name createExportsJob
   * @param (string) puuid - Processing Job UUID
   * @param (string) duuid - Dataset UUID
   * @param (string) type - Export type
   * @param (boolean) dryrun - Create export job entry without starting the job
   * @param (object) payload - Export Job
   */

  api.createExportsJob = async (params = {}, options = {}) => {
    let method = 'post'.toUpperCase()
    let path = `/v${version || 2}` + '/exports'
    let query = {}
    let body = {}
    let security = true

    if (params['puuid'] !== undefined) {
      body['puuid'] = params['puuid']
    }

    if (params['duuid'] !== undefined) {
      body['duuid'] = params['duuid']
    }

    if (params['type'] !== undefined) {
      body['type'] = params['type']
    }

    if (params['dryrun'] !== undefined) {
      body['dryrun'] = params['dryrun']
    }

    if (params['payload'] !== undefined) {
      body['payload'] = params['payload']
    }

    return api.request({
      method,
      path,
      query,
      body,
      security,
      options
    })
  }
  /**
   * Export Job
   * Export Job
   * @method
   * @name getExportsJob
   * @param (string) id - Export job identifier
   */

  api.getExportsJob = async (params = {}, options = {}) => {
    let method = 'get'.toUpperCase()
    let path = `/v${version || 2}` + '/exports/{id}'
    let query = {}
    let body = {}
    let security = true

    if (params['id'] !== undefined) {
      path = path.replace('{' + 'id' + '}', params['id'])
    }

    return api.request({
      method,
      path,
      query,
      body,
      security,
      options
    })
  }
  /**
   * Create flight log
   * Create flith log
   * @method
   * @name createFlightLog
   * @param (string) service - Create flith log
   * @param (string) token - Authentication token
   * @param (string) app - Application name unique for Airdata
   * @param (string) file - Flight log file path on S3
   * @param (string) user - User name
   * @param (string) pass - Password
   * @param (string) server - Custom server name
   */

  api.createFlightLog = async (params = {}, options = {}) => {
    let method = 'post'.toUpperCase()
    let path = `/v${version || 2}` + '/flightlogs'
    let query = {}
    let body = {}
    let security = true

    if (params['service'] !== undefined) {
      body['service'] = params['service']
    }

    if (params['token'] !== undefined) {
      body['token'] = params['token']
    }

    if (params['app'] !== undefined) {
      body['app'] = params['app']
    }

    if (params['file'] !== undefined) {
      body['file'] = params['file']
    }

    if (params['user'] !== undefined) {
      body['user'] = params['user']
    }

    if (params['pass'] !== undefined) {
      body['pass'] = params['pass']
    }

    if (params['server'] !== undefined) {
      body['server'] = params['server']
    }

    return api.request({
      method,
      path,
      query,
      body,
      security,
      options
    })
  }
  /**
   * Get flight log
   * Get flight log
   * @method
   * @name getFlightLog
   * @param (string) uuid - Flight log identifier
   */

  api.getFlightLog = async (params = {}, options = {}) => {
    let method = 'get'.toUpperCase()
    let path = `/v${version || 2}` + '/flightlogs/{uuid}'
    let query = {}
    let body = {}
    let security = true

    if (params['uuid'] !== undefined) {
      path = path.replace('{' + 'uuid' + '}', params['uuid'])
    }

    return api.request({
      method,
      path,
      query,
      body,
      security,
      options
    })
  }
  /**
   * Get a list of known geoids for a specific location (lat/lon)
   * Get a list of known geoids for a specific location (lat/lon)
   * @method
   * @name getGeoids
   * @param (number) lon - Longitude
   * @param (number) lat - Latitude
   */

  api.getGeoids = async (params = {}, options = {}) => {
    let method = 'get'.toUpperCase()
    let path = `/v${version || 2}` + '/geoids'
    let query = {}
    let body = {}
    let security = false

    if (params['lon'] !== undefined) {
      query['lon'] = params['lon']
    }

    if (params['lat'] !== undefined) {
      query['lat'] = params['lat']
    }

    return api.request({
      method,
      path,
      query,
      body,
      security,
      options
    })
  }
  /**
   * Something
   * Something
   * @method
   * @name getGeoidsHeight
   * @param (string) id - Geoid
   * @param (number) lat - Latitude
   * @param (number) lon - Longtitude
   */

  api.getGeoidsHeight = async (params = {}, options = {}) => {
    let method = 'get'.toUpperCase()
    let path = `/v${version || 2}` + '/geoids/{id}/height'
    let query = {}
    let body = {}
    let security = false

    if (params['id'] !== undefined) {
      path = path.replace('{' + 'id' + '}', params['id'])
    }

    if (params['lat'] !== undefined) {
      query['lat'] = params['lat']
    }

    if (params['lon'] !== undefined) {
      query['lon'] = params['lon']
    }

    return api.request({
      method,
      path,
      query,
      body,
      security,
      options
    })
  }
  /**
   * Third-party Integration Job
   * Create Third-party Integration Job
   * @method
   * @name createIntegrationJob
   * @param (string) puuid - Processing Job UUID
   * @param (string) duuid - Dataset UUID
   * @param (string) account - Account ID used to authorize the OAuth app (where applicable)
   * @param (string) provider - Provider ID (OAuth App ID)
   * @param (object) payload - Integration configuration
   */

  api.createIntegrationJob = async (params = {}, options = {}) => {
    let method = 'post'.toUpperCase()
    let path = `/v${version || 2}` + '/integrations'
    let query = {}
    let body = {}
    let security = true

    if (params['puuid'] !== undefined) {
      body['puuid'] = params['puuid']
    }

    if (params['duuid'] !== undefined) {
      body['duuid'] = params['duuid']
    }

    if (params['account'] !== undefined) {
      body['account'] = params['account']
    }

    if (params['provider'] !== undefined) {
      body['provider'] = params['provider']
    }

    if (params['payload'] !== undefined) {
      body['payload'] = params['payload']
    }

    return api.request({
      method,
      path,
      query,
      body,
      security,
      options
    })
  }
  /**
   * Something
   * Something
   * @method
   * @name measureSurfaceElevation
   * @param (boolean) compact - True to compact the elevation deltas
   * @param (string) surfaceId - Processing Job UUID
   * @param (string) surfaceType - Surface type
   * @param (number) level - Zoom level
   * @param (object) feature - Something
   */

  api.measureSurfaceElevation = async (params = {}, options = {}) => {
    let method = 'post'.toUpperCase()
    let path = `/v${version || 2}` + '/measure/elevations'
    let query = {}
    let body = {}
    let security = true

    if (params['compact'] !== undefined) {
      query['compact'] = params['compact']
    }

    if (params['surfaceId'] !== undefined) {
      body['surfaceId'] = params['surfaceId']
    }

    if (params['surfaceType'] !== undefined) {
      body['surfaceType'] = params['surfaceType']
    }

    if (params['level'] !== undefined) {
      body['level'] = params['level']
    }

    if (params['feature'] !== undefined) {
      body['feature'] = params['feature']
    }

    return api.request({
      method,
      path,
      query,
      body,
      security,
      options
    })
  }
  /**
   * Trigger progress tracking pipeline
   * Consumers trigger the progress tracking pipeline and are being notified by a callback sent to this endpoint
   * @method
   * @name measureProgress
   * @param (string) id - The report identifier
   * @param (object) initialSurface - Initial surface
   * @param (object) finalSurface - Final surface
   * @param (array) processingJobs - Consumers trigger the progress tracking pipeline and are being notified by a callback sent to this endpoint
   * @param (number) level - Zoom level
   * @param (object) bounds - Consumers trigger the progress tracking pipeline and are being notified by a callback sent to this endpoint
   * @param (number) changeThreshold - Consumers trigger the progress tracking pipeline and are being notified by a callback sent to this endpoint
   * @param (object) callback - Consumers trigger the progress tracking pipeline and are being notified by a callback sent to this endpoint
   */

  api.measureProgress = async (params = {}, options = {}) => {
    let method = 'post'.toUpperCase()
    let path = `/v${version || 2}` + '/measure/progress'
    let query = {}
    let body = {}
    let security = true

    if (params['id'] !== undefined) {
      body['id'] = params['id']
    }

    if (params['initialSurface'] !== undefined) {
      body['initialSurface'] = params['initialSurface']
    }

    if (params['finalSurface'] !== undefined) {
      body['finalSurface'] = params['finalSurface']
    }

    if (params['processingJobs'] !== undefined) {
      body['processingJobs'] = params['processingJobs']
    }

    if (params['level'] !== undefined) {
      body['level'] = params['level']
    }

    if (params['bounds'] !== undefined) {
      body['bounds'] = params['bounds']
    }

    if (params['changeThreshold'] !== undefined) {
      body['changeThreshold'] = params['changeThreshold']
    }

    if (params['callback'] !== undefined) {
      body['callback'] = params['callback']
    }

    return api.request({
      method,
      path,
      query,
      body,
      security,
      options
    })
  }
  /**
   * Retrieve the status and result of a measurement job
   * Retrieve the status and result of a measurement job
   * @method
   * @name getMeasurementResult
   * @param (string) type - Measurement Type
   * @param (string) id - Measurement ID
   */

  api.getMeasurementResult = async (params = {}, options = {}) => {
    let method = 'get'.toUpperCase()
    let path = `/v${version || 2}` + '/measure/{type}/{id}'
    let query = {}
    let body = {}
    let security = true

    if (params['type'] !== undefined) {
      path = path.replace('{' + 'type' + '}', params['type'])
    }

    if (params['id'] !== undefined) {
      path = path.replace('{' + 'id' + '}', params['id'])
    }

    return api.request({
      method,
      path,
      query,
      body,
      security,
      options
    })
  }
  /**
   * Measure Aggregate Volume
   * Measure Aggregate Volume
   * @method
   * @name measureAggregateVolume
   * @param (string) type - Measurement Type
   * @param (boolean) dryrun - Create measurement entry without starting the job
   * @param (boolean) refresh - Force re-calculation of a measurement
   * @param (string) surfaceId - Processing Job UUID
   * @param (string) surfaceType - Surface type
   * @param (array) surfaces - Measure Aggregate Volume
   * @param (number) level - Zoom level
   * @param (object) feature - Measure Aggregate Volume
   * @param (object) basePlane - Baseplane to compare the surface against for basic_volume measurements.
   * @param (number) changeThreshold - Changes below this threshold will be ignored when calculating progress measurements.
   */

  api.measureAggregateVolume = async (params = {}, options = {}) => {
    let method = 'post'.toUpperCase()
    let path = `/v${version || 2}` + '/measure/aggregate/{type}'
    let query = {}
    let body = {}
    let security = true

    if (params['type'] !== undefined) {
      path = path.replace('{' + 'type' + '}', params['type'])
    }

    if (params['dryrun'] !== undefined) {
      query['dryrun'] = params['dryrun']
    }

    if (params['refresh'] !== undefined) {
      query['refresh'] = params['refresh']
    }

    if (params['surfaceId'] !== undefined) {
      body['surfaceId'] = params['surfaceId']
    }

    if (params['surfaceType'] !== undefined) {
      body['surfaceType'] = params['surfaceType']
    }

    if (params['surfaces'] !== undefined) {
      body['surfaces'] = params['surfaces']
    }

    if (params['level'] !== undefined) {
      body['level'] = params['level']
    }

    if (params['feature'] !== undefined) {
      body['feature'] = params['feature']
    }

    if (params['basePlane'] !== undefined) {
      body['basePlane'] = params['basePlane']
    }

    if (params['changeThreshold'] !== undefined) {
      body['changeThreshold'] = params['changeThreshold']
    }

    return api.request({
      method,
      path,
      query,
      body,
      security,
      options
    })
  }
  /**
   * Measure Aggregate Volume
   * Measure Aggregate Volume
   * @method
   * @name measureSurface
   * @param (boolean) refresh - Re-calculate measurement
   * @param (array) surfaces - Measure Aggregate Volume
   * @param (number) level - Zoom level
   * @param (object) basePlane - Baseplane to compare the surface against for basic_volume measurements.
   * @param (object) feature - Measure Aggregate Volume
   * @param (string) callback - Callback URL to invoke once the measurement is done (async mode)
   * @param (array) batch - Measure Aggregate Volume
   */

  api.measureSurface = async (params = {}, options = {}) => {
    let method = 'post'.toUpperCase()
    let path = `/v${version || 2}` + '/measure/surface'
    let query = {}
    let body = {}
    let security = true

    if (params['refresh'] !== undefined) {
      query['refresh'] = params['refresh']
    }

    if (params['surfaces'] !== undefined) {
      body['surfaces'] = params['surfaces']
    }

    if (params['level'] !== undefined) {
      body['level'] = params['level']
    }

    if (params['basePlane'] !== undefined) {
      body['basePlane'] = params['basePlane']
    }

    if (params['feature'] !== undefined) {
      body['feature'] = params['feature']
    }

    if (params['callback'] !== undefined) {
      body['callback'] = params['callback']
    }

    if (params['batch'] !== undefined) {
      body['batch'] = params['batch']
    }

    return api.request({
      method,
      path,
      query,
      body,
      security,
      options
    })
  }
  /**
   * Something
   * Something
   * @method
   * @name getMetadata
   * @param (string) duuid - Dataset UUID
   * @param (string) puuid - Processing job UUID
   * @param (string) path - Object path to return
   * @param (string) resolve - Comma separated list of entities to resolve
   */

  api.getMetadata = async (params = {}, options = {}) => {
    let method = 'get'.toUpperCase()
    let path = `/v${version || 2}` + '/metadata'
    let query = {}
    let body = {}
    let security = true

    if (params['duuid'] !== undefined) {
      query['duuid'] = params['duuid']
    }

    if (params['puuid'] !== undefined) {
      query['puuid'] = params['puuid']
    }

    if (params['path'] !== undefined) {
      query['path'] = params['path']
    }

    if (params['resolve'] !== undefined) {
      query['resolve'] = params['resolve']
    }

    return api.request({
      method,
      path,
      query,
      body,
      security,
      options
    })
  }
  /**
   * Something
   * Something
   * @method
   * @name updateMetadata
   * @param (string) puuid - Processing job UUID
   * @param (string) path - Path to update
   * @param (string) action - Action to perform on the path
   * @param () value - Value to set
   */

  api.updateMetadata = async (params = {}, options = {}) => {
    let method = 'patch'.toUpperCase()
    let path = `/v${version || 2}` + '/metadata'
    let query = {}
    let body = {}
    let security = true

    if (params['puuid'] !== undefined) {
      body['puuid'] = params['puuid']
    }

    if (params['path'] !== undefined) {
      body['path'] = params['path']
    }

    if (params['action'] !== undefined) {
      body['action'] = params['action']
    }

    if (params['value'] !== undefined) {
      body['value'] = params['value']
    }

    return api.request({
      method,
      path,
      query,
      body,
      security,
      options
    })
  }
  /**
   * Gets All Precog UI Jobs
   * Gets All Precog UI Jobs
   * @method
   * @name getPrecogUIJobs
   * @param (integer) count - response records count
   * @param (string) next-process_uuid - next page token
   */

  api.getPrecogUIJobs = async (params = {}, options = {}) => {
    let method = 'get'.toUpperCase()
    let path = `/v${version || 2}` + '/precog-jobs'
    let query = {}
    let body = {}
    let security = false

    if (params['count'] !== undefined) {
      query['count'] = params['count']
    }

    if (params['next-process_uuid'] !== undefined) {
      query['next-process_uuid'] = params['next-process_uuid']
    }

    return api.request({
      method,
      path,
      query,
      body,
      security,
      options
    })
  }
  /**
   * Get Precog UI Job
   * Get Precog UI Job
   * @method
   * @name getPrecogUIJob
   * @param (string) uuid - Processing Job Identifier
   */

  api.getPrecogUIJob = async (params = {}, options = {}) => {
    let method = 'get'.toUpperCase()
    let path = `/v${version || 2}` + '/precog-jobs/{uuid}'
    let query = {}
    let body = {}
    let security = false

    if (params['uuid'] !== undefined) {
      path = path.replace('{' + 'uuid' + '}', params['uuid'])
    }

    return api.request({
      method,
      path,
      query,
      body,
      security,
      options
    })
  }
  /**
   * Enqueue Precot UI Job
   * Enqueue Precot UI Job
   * @method
   * @name createPrecogUIJob
   * @param (string) uuid - Processing Job Identifier
   */

  api.createPrecogUIJob = async (params = {}, options = {}) => {
    let method = 'post'.toUpperCase()
    let path = `/v${version || 2}` + '/precog-jobs/{uuid}/process'
    let query = {}
    let body = {}
    let security = false

    if (params['uuid'] !== undefined) {
      path = path.replace('{' + 'uuid' + '}', params['uuid'])
    }

    return api.request({
      method,
      path,
      query,
      body,
      security,
      options
    })
  }
  /**
   * Delete marks for a specific precog job
   * Delete marks for a specific precog job
   * @method
   * @name deletePrecogUiMarks
   * @param (string) uuid - Processing Job Identifier
   * @param (string) id - Marks Identifier
   * @param (string) cpId - Delete marks for a specific precog job
   * @param (string) imageId - Delete marks for a specific precog job
   */

  api.deletePrecogUiMarks = async (params = {}, options = {}) => {
    let method = 'delete'.toUpperCase()
    let path = `/v${version || 2}` + '/precog-jobs/{uuid}/marks/{id}'
    let query = {}
    let body = {}
    let security = false

    if (params['uuid'] !== undefined) {
      path = path.replace('{' + 'uuid' + '}', params['uuid'])
    }

    if (params['id'] !== undefined) {
      path = path.replace('{' + 'id' + '}', params['id'])
    }

    if (params['cpId'] !== undefined) {
      body['cpId'] = params['cpId']
    }

    if (params['imageId'] !== undefined) {
      body['imageId'] = params['imageId']
    }

    return api.request({
      method,
      path,
      query,
      body,
      security,
      options
    })
  }
  /**
   * Update precog-ui marks
   * Update precog-ui marks
   * @method
   * @name updatePrecogUIMarks
   * @param (string) uuid - Processing Job Identifier
   * @param (string) id - Marks Identifier
   * @param (string) cpId - Update precog-ui marks
   * @param (string) imageId - Update precog-ui marks
   * @param (number) x - Update precog-ui marks
   * @param (number) y - Update precog-ui marks
   */

  api.updatePrecogUIMarks = async (params = {}, options = {}) => {
    let method = 'patch'.toUpperCase()
    let path = `/v${version || 2}` + '/precog-jobs/{uuid}/marks/{id}'
    let query = {}
    let body = {}
    let security = false

    if (params['uuid'] !== undefined) {
      path = path.replace('{' + 'uuid' + '}', params['uuid'])
    }

    if (params['id'] !== undefined) {
      path = path.replace('{' + 'id' + '}', params['id'])
    }

    if (params['cpId'] !== undefined) {
      body['cpId'] = params['cpId']
    }

    if (params['imageId'] !== undefined) {
      body['imageId'] = params['imageId']
    }

    if (params['x'] !== undefined) {
      body['x'] = params['x']
    }

    if (params['y'] !== undefined) {
      body['y'] = params['y']
    }

    return api.request({
      method,
      path,
      query,
      body,
      security,
      options
    })
  }
  /**
   * Get Processing Job
   * Get Processing Job
   * @method
   * @name getProcessingJob
   * @param (string) uuid - Processing Job identifier
   */

  api.getProcessingJob = async (params = {}, options = {}) => {
    let method = 'get'.toUpperCase()
    let path = `/v${version || 2}` + '/processes/{uuid}'
    let query = {}
    let body = {}
    let security = true

    if (params['uuid'] !== undefined) {
      path = path.replace('{' + 'uuid' + '}', params['uuid'])
    }

    return api.request({
      method,
      path,
      query,
      body,
      security,
      options
    })
  }
  /**
   * List Processing Job Results
   * List Processing Job Results
   * @method
   * @name getProcessingResults
   * @param (string) uuid - Processing Job ID
   * @param (boolean) layers - Toggle layers in response object
   * @param (boolean) files - Toggle files in response object
   * @param (array) exportTypes - Export Types
   * @param (number) expiration - Expiration time in seconds for all output file and layer links
   * @param (string) layer - Request specific layer(s)
   */

  api.getProcessingResults = async (params = {}, options = {}) => {
    let method = 'get'.toUpperCase()
    let path = `/v${version || 2}` + '/processes/{uuid}/result'
    let query = {}
    let body = {}
    let security = true

    if (params['uuid'] !== undefined) {
      path = path.replace('{' + 'uuid' + '}', params['uuid'])
    }

    if (params['layers'] !== undefined) {
      query['layers'] = params['layers']
    }

    if (params['files'] !== undefined) {
      query['files'] = params['files']
    }

    if (params['exportTypes'] !== undefined) {
      query['exportTypes'] = params['exportTypes']
    }

    if (params['expiration'] !== undefined) {
      query['expiration'] = params['expiration']
    }

    if (params['layer'] !== undefined) {
      query['layer'] = params['layer']
    }

    return api.request({
      method,
      path,
      query,
      body,
      security,
      options
    })
  }
  /**
   * Resume Processing Job
   * Resume Processing Job
   * @method
   * @name resumeProcessingJob
   * @param (string) uuid - Processing Job Identifier
   * @param (string) apikey - Resume Processing Job
   * @param (string) jumpTo - Processing Job Type
   */

  api.resumeProcessingJob = async (params = {}, options = {}) => {
    let method = 'post'.toUpperCase()
    let path = `/v${version || 2}` + '/processes/{uuid}/resume'
    let query = {}
    let body = {}
    let security = false

    if (params['uuid'] !== undefined) {
      path = path.replace('{' + 'uuid' + '}', params['uuid'])
    }

    if (params['apikey'] !== undefined) {
      body['apikey'] = params['apikey']
    }

    if (params['jumpTo'] !== undefined) {
      body['jumpTo'] = params['jumpTo']
    }

    return api.request({
      method,
      path,
      query,
      body,
      security,
      options
    })
  }
  /**
   * Get a list of known projections for a specific location (lat/lon)
   * Get a list of known projections for a specific location (lat/lon)
   * @method
   * @name getProjections
   * @param (number) lon - Longitude
   * @param (number) lat - Latitude
   */

  api.getProjections = async (params = {}, options = {}) => {
    let method = 'get'.toUpperCase()
    let path = `/v${version || 2}` + '/projections'
    let query = {}
    let body = {}
    let security = false

    if (params['lon'] !== undefined) {
      query['lon'] = params['lon']
    }

    if (params['lat'] !== undefined) {
      query['lat'] = params['lat']
    }

    return api.request({
      method,
      path,
      query,
      body,
      security,
      options
    })
  }
  /**
   * Store localization file from a site
   * Store localization file from a site
   * @method
   * @name uploadLocalization
   * @param (string) id - Site ID
   * @param (object) ccrsFile - The file content and properties
   */

  api.uploadLocalization = async (params = {}, options = {}) => {
    let method = 'post'.toUpperCase()
    let path = `/v${version || 2}` + '/sites/{id}'
    let query = {}
    let body = {}
    let security = true

    if (params['id'] !== undefined) {
      path = path.replace('{' + 'id' + '}', params['id'])
    }

    if (params['ccrsFile'] !== undefined) {
      body['ccrsFile'] = params['ccrsFile']
    }

    return api.request({
      method,
      path,
      query,
      body,
      security,
      options
    })
  }
  /**
   * Find UUID
   * Find data about a given UUID
   * @method
   * @name supportFindUUID
   * @param (string) uuid - UUID to find
   * @param (string) env - Environment to search in
   */

  api.supportFindUUID = async (params = {}, options = {}) => {
    let method = 'get'.toUpperCase()
    let path = `/v${version || 2}` + '/support/find/{uuid}'
    let query = {}
    let body = {}
    let security = false

    if (params['uuid'] !== undefined) {
      path = path.replace('{' + 'uuid' + '}', params['uuid'])
    }

    if (params['env'] !== undefined) {
      query['env'] = params['env']
    }

    return api.request({
      method,
      path,
      query,
      body,
      security,
      options
    })
  }
  /**
   * Teck IoT Demo
   * Get Teck IoT Device Demo Data
   * @method
   * @name getDemoTeckIoTDeviceData
   * @param (string) deviceId - Device ID
   * @param (number) start - Retrieve all events >= the start time.
   * @param (number) end - Retrieve all events < the end time.
   */

  api.getDemoTeckIoTDeviceData = async (params = {}, options = {}) => {
    let method = 'get'.toUpperCase()
    let path = `/v${version || 2}` + '/demos/teck/iot/{deviceId}'
    let query = {}
    let body = {}
    let security = false

    if (params['deviceId'] !== undefined) {
      path = path.replace('{' + 'deviceId' + '}', params['deviceId'])
    }

    if (params['start'] !== undefined) {
      query['start'] = params['start']
    }

    if (params['end'] !== undefined) {
      query['end'] = params['end']
    }

    return api.request({
      method,
      path,
      query,
      body,
      security,
      options
    })
  }
  /**
   * Overlays
   * Overlays
   * @method
   * @name createOverlay
   * @param (string) uuid - The overlay uuid
   * @param (object) geometry - Geometry of an overlay, includes bounds and rotation.
   */

  api.createOverlay = async (params = {}, options = {}) => {
    let method = 'post'.toUpperCase()
    let path = `/v${version || 2}` + '/overlays'
    let query = {}
    let body = {}
    let security = true

    if (params['uuid'] !== undefined) {
      body['uuid'] = params['uuid']
    }

    if (params['geometry'] !== undefined) {
      body['geometry'] = params['geometry']
    }

    return api.request({
      method,
      path,
      query,
      body,
      security,
      options
    })
  }
  /**
   * Get an overlay
   * Retrieve an overlay information by id
   * @method
   * @name getOverlay
   * @param (string) uuid - Overlay identifier
   * @param (boolean) include_urls - True if response should include the signed urls for the preview image and tiles folder.
   */

  api.getOverlay = async (params = {}, options = {}) => {
    let method = 'get'.toUpperCase()
    let path = `/v${version || 2}` + '/overlays/{uuid}'
    let query = {}
    let body = {}
    let security = true

    if (params['uuid'] !== undefined) {
      path = path.replace('{' + 'uuid' + '}', params['uuid'])
    }

    if (params['include_urls'] !== undefined) {
      query['include_urls'] = params['include_urls']
    }

    return api.request({
      method,
      path,
      query,
      body,
      security,
      options
    })
  }

  return api
}