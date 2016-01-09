#!/usr/bin/env node

'use strict'

const cli = require('..')

setTimeout(() => {
  if (cli.find('auth')) {
    cli.exec('auth')
  }
}, 200)

cli
  .show()
  .parse(process.argv)
