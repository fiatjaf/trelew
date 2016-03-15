'use strict'

const slugify = require('slugg')
const tru = require('truncate')
const pad = require('pad')
const relativeDate = require('relative-date')
const marked = require('marked')
const TerminalRenderer = require('marked-terminal')
const chalk = require('chalk')

module.exports = {
  promptBoards,
  promptLists,
  promptCards,
  listBoards,
  listLists,
  listCards,
  cardInfo,
  listComments,
  listChecklists,
  listAttachments,
  currentLevel,
  slug,
  md,
  color,
  color2,
  color3,
  truncate
}

var session = require('.').session

let allEscapes = Object.keys(chalk.styles).map(c => chalk.styles[c].close).join('')
function truncate (text, number) {
  return tru(text, number) + allEscapes
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
    hr: chalk.green,
    reflowText: true
  })
})
function md (text) {
  return marked(text)
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
  return slugify(entity.name).slice(0, 26) || "unnamed"
}

function promptBoards(boards) {
  return boards.map((b, i) => {
      let nmembers = b.memberships.length
      let nlists = b.lists.length
      let last = relativeDate(Date.parse(b.dateLastActivity))
      return `${color3(i + 1 + ': ')} ${truncate(pad(b.name, 40), 40)} ${color3(pad(last || '', 15))} ${pad(2, nmembers)} ${color2('members')} ${pad(2, nlists)} ${color2('lists')}`
    }).join("\n") +  "\n\nWhich One: "
}

function promptLists(lists) {
  return lists.map((b, i) => {
    let cards = b.cards.map(c => color3(truncate(c.name, 10))).slice(0, 6).join(', ')
    return `${color3(i + 1 + ": ")} ${truncate(pad(b.name, 28), 28)}: [${cards}]`
  }).join('\n') + "\n\nWhich One: "
}

function promptCards(cards) {
  return cards.map((b, i) => {
    let name = truncate(pad(b.name, 37), 37)
    if (!b.due) {
      return `${color3(i + 1 + ": ")} ${name} > "${color2(truncate(md(b.desc), 44)).replace(/[\n\r]/g, ' ')}"`
    } else {
      return `${color3(i + 1 + ": ")} ${name} (due ${b.due.split('.')[0]}) > "${color2(truncate(md(b.desc), 20)).replace(/[\n\r]/g, ' ')}"`
    }
  }).join('\n') + "\n\nWhich One: "
}

function listBoards () {
  this.log('\nyour boards:\n' + session.current.boards.map(b => {
    let nmembers = b.memberships.length
    let nlists = b.lists.length
    let last = relativeDate(Date.parse(b.dateLastActivity))
    return ` ${color3('-')} ${truncate(pad(b.name, 40), 40)} ${color3(pad(last || '', 15))} ${pad(2, nmembers)} ${color2('members')} ${pad(2, nlists)} ${color2('lists')}`
  }).join('\n'))
}

function listLists () {
  this.log('\nlists in this board:\n' + session.current.lists.map(b => {
    let cards = b.cards.map(c => color3(truncate(c.name, 10))).slice(0, 6).join(', ')
    return ` ${color3('-')} ${truncate(pad(b.name, 28), 28)}: [${cards}]`
  }).join('\n'))
}

function listCards () {
  this.log('\ncards in this list:\n' + session.current.cards.map(b => {
    let name = truncate(pad(b.name, 37), 37)
    if (!b.due) {
      return ` ${color3('-')} ${name} > "${color2(truncate(md(b.desc), 44)).replace(/[\n\r]/g, ' ')}"`
    } else {
      return ` ${color3('-')} ${name} (due ${b.due.split('.')[0]}) > "${color2(truncate(md(b.desc), 20)).replace(/[\n\r]/g, ' ')}"`
    }
  }).join('\n'))
}

function cardInfo () {
  this.log('\n' + color2(session.current.card.name) + truncate(md(session.current.card.desc), 200))
  this.log(chalk.green('---\n'))
  this.log(color2(session.current.comments.length) + ' comments')
  this.log(color2(session.current.checklists.length) + ' checklists')
  this.log(color2(session.current.attachments.length) + ' attachments')
}

function listComments () {
  this.log('\nlast comments (top to bottom):\n' + session.current.comments.reverse().map(c => {
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
