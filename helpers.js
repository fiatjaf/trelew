'use strict'

const slugify = require('slugg')
const truncate = require('truncate')
const pad = require('pad')
const marked = require('marked')
const TerminalRenderer = require('marked-terminal')
const chalk = require('chalk')

module.exports = {
  listBoards,
  listLists,
  listCards,
  listComments,
  listChecklists,
  listAttachments,
  currentLevel,
  slug,
  md,
  color,
  color2,
  color3,
  line
}

var session = require('.').session

function line () {
  return '\n' + md('---') + '\n'
}

function color3 (text) {
  return chalk.green(text)
}

function color2 (text) {
  return chalk.magenta(text)
}

function color (text) {
  return chalk.cyan(text)
}

marked.setOptions({
  renderer: new TerminalRenderer({
    paragraph: chalk.dim,
    listitem: chalk.dim,
    table: chalk.dim,
    hr: chalk.green
  })
})
let allEscapes = Object.keys(chalk.styles).map(c => chalk.styles[c].close).join('')
function md (text) {
  return marked(text) + allEscapes
}

function currentLevel () {
  if (session.current.entity.length === 0) {
    return 'user'
  } else if (session.current.entity[0].due !== undefined) {
    return 'card'
  } else if (session.current.entity[0].dateLastActivity !== undefined) {
    return 'board'
  } else if (session.current.entity.length > 1) {
    return 'list'
  }
  return 'auth'
}

function slug (entity) {
  return truncate(slugify(entity.name), 26)
}

function listBoards () {
  this.log('\nyour boards:\n' + session.current.boards.map(b => {
    return ` ${color3('-')} ${pad(b.name, 40)} as ${pad(color2(slug(b)), 40)}`
  }).join('\n'))
}

function listLists () {
  this.log('\nlists in this board:\n' + session.current.lists.map(b => {
    let cards = b.cards.map(c => color2(truncate(c.name, 9))).slice(0, 5).join(', ')
    return ` ${color3('-')} ${pad(truncate(b.name, 27), 28)}: [${cards}]`
  }).join('\n'))
}

function listCards () {
  this.log('\ncards in this list:\n' + session.current.cards.map(b => {
    let name = pad(truncate(b.name, 36), 37)
    if (!b.due) {
      return ` ${color3('-')} ${name} > "${color2(md(truncate(b.desc, 44))).replace(/[\n\r]/g, ' ')}"`
    } else {
      return ` ${color3('-')} ${name} (due ${b.due.split('.')[0]}) > "${color2(md(truncate(b.desc, 20))).replace(/[\n\r]/g, ' ')}"`
    }
  }).join('\n'))
}

function listComments () {
  this.log('\nlast comments (top to bottom):\n' + session.current.comments.map(c => {
    return `${color3(c.memberCreator.username)} @ ${color2(c.date)}:\n  > ${md(c.data.text)}`
  }).join('\n'))
}

function listAttachments () {
  this.log('\nattachments:\n' + session.current.attachments.map(c => {
    return ` ${color3('-')} ${c.name} @ ${chalk.blue.underline(c.url)}`
  }).join('\n'))
}

function listChecklists () {
  this.log('checklists:\n' + session.current.checklists.map(c => {
    let checkitems = c.checkItems.map(i => {
      return `     ${chalk.styles.green.open}[${i.state === 'complete' ? 'x' : ' '}]${chalk.styles.green.close} ${i.name}`
    }).join('\n')
    return ` ${color3('-')} ` + c.name + '\n' + checkitems
  }).join('\n\n'))
}
