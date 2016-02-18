#!/usr/bin/env node

if (parseInt(process.versions.node.split('.')[0], 10) < 4) {
  console.log("I'm sorry, this app requires a Node version equal or higher than 4.0.0.")
  console.log('Yours is ' + process.versions.node + '.')
  console.log('Please look at http://stackoverflow.com/questions/10075990/upgrading-node-js-to-latest-version/10076029#10076029 for a super easy guide on how to upgrade.')
  process.exit()
}

var cli = require('..')

setTimeout(function () {
  if (cli.find('auth')) {
    cli.exec('auth')
      .then(() => cli.parse(process.argv))
  }
}, 200)

cli
  .show()
