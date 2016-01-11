'use strict'

const meta = require('./package.json')
const mkdirp = require('mkdirp')
const FileStoreSync = require('file-store-sync')

let HOME = process.env[(process.platform === 'win32') ? 'USERPROFILE' : 'HOME']

let configPath = HOME + '/.' + meta.name.split('-')[0]
mkdirp.sync(configPath)

module.exports = {
  name: meta.name.split('-')[0],
  store: new FileStoreSync(configPath + '/data'),
  devKey: 'ac61d8974aa86dd25f9597fa651a2ed8'
}

// export const config = ini.parse(fs.readFileSync(config.))
