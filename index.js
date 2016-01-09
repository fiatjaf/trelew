'use strict'

const editInVim = require('edit-in-vim')
const promisify = require('tiny-promisify')
const splitwords = require('split-words')
const chalk = require('chalk')

var config = require('./config')

const Trello = new (require('node-trello'))(config.devKey)
Trello.getAsync = promisify(Trello.get, {context: Trello})
Trello.putAsync = promisify(Trello.put, {context: Trello})
Trello.postAsync = promisify(Trello.post, {context: Trello})
Trello.delAsync = promisify(Trello.del, {context: Trello})

var session = module.exports.session = {
  'user': null,
  'notifications': null,
  'current': {
    'entity': [],
    'vcommands': [],
    'boards': [],
    'lists': [],
    'cards': [],
    'checklists': [],
    'comments': [],
    'attachments': []
  }
}

const helpers = require('./helpers')

const vorpal = require('vorpal')()
vorpal
  .use('vorpal-less')

vorpal
  .command('auth')
  .option('-t, --token [val]', `Trello API token for key ${config.devKey}`)
  .action(function (args, cb) {
    if (args.options.token) config.store.set('token', args.options.token)
    let userToken = config.store.get('token')
    if (userToken) {
      Trello.token = userToken
      logged.call(this, cb)
    } else {
      this.log(`For the first access, you will have to get an authorization token from Trello.
Please go to

    https://trello.com/1/connect?key=${config.devKey}&name=Trelew&response_type=token&expires=never&scope=read,write

`)
      this.prompt({
        type: 'input',
        name: 'token',
        message: `and paste here the token you'll get: `
      }, (result) => {
        config.store.set('token', result.token)
        Trello.token = result.token
        logged.call(this, cb)
      })
    }
  })

vorpal
  .command('cd [path]', 'move back in the hierarchy')
  .action(function (args, cb) {
    if (args.path !== '..') {
      return cb() // only support '..' for now
    }

    session.current.entity.shift()
    let entity = session.current.entity[0]
    let level = helpers.currentLevel()
    switch (level) {
      case 'card':
        enterCard.call(this, entity, cb)
        break
      case 'list':
        enterList.call(this, entity, cb)
        break
      case 'board':
        enterBoard.call(this, entity, cb)
        break
      case 'user':
        logged.call(this, cb)
        break
    }
  })

vorpal
  .command('ls', 'show info about current board, list or card.')
  .alias('info')
  .action(function (_, cb) {
    switch (helpers.currentLevel()) {
      case 'auth':
        break
      case 'user':
        helpers.listBoards.call(this)
        break
      case 'board':
        helpers.listLists.call(this)
        break
      case 'list':
        helpers.listCards.call(this)
        break
      case 'card':
        let card = session.current.entity[0]
        this.log(`card '${card.name}' ${card.due ? '(' + card.due.split('.')[0] + ')' : ''}`)
        this.log(helpers.md('---'))
        this.log(`${helpers.md(card.desc)}`)
        this.log(helpers.md('---'))
        this.log(helpers.color2(session.current.comments.length) + ' comments')
        this.log(helpers.color2(session.current.checklists.length) + ' checklists')
        this.log(helpers.color2(session.current.attachments.length) + ' attachments')
    }
    cb()
  })

module.exports = vorpal.delimiter(helpers.color('trelew') + '~$')

function enterCard (card, cb) {
  this.delimiter('entering ' + card.name + '...')
  return Trello.getAsync(`/1/cards/${card.id}`, {
    fields: 'id',
    actions: 'commentCard,copyCommentCard',
    actions_limit: 5,
    actions_entities: 'true',
    action_memberCreator_fields: 'username',
    attachments: 'true',
    attachment_fields: 'name,url',
    checklists: 'all',
    checkItemStates: 'true',
    checklist_fields: 'name'
  })
  .then(res => {
    vorpal.delimiter(helpers.color(helpers.slug(card)) + '~$')
    session.current.comments = res.actions
    session.current.attachments = res.attachments
    session.current.checklists = res.checklists
    this.log(`card '${card.name}' ${card.due ? '(' + card.due.split('.')[0] + ')' : ''}`)
    this.log(helpers.color2(splitwords(card.desc).length) + ' words in description')
    this.log(helpers.color2(session.current.comments.length) + ' comments')
    this.log(helpers.color2(session.current.checklists.length) + ' checklists')
    this.log(helpers.color2(session.current.attachments.length) + ' attachments')
  })
  .then(() => {
    // clean old commands
    for (var k in session.current.vcommands) {
      session.current.vcommands[k].remove()
      delete session.current.vcommands[k]
    }

    // add new commands
    session.current.vcommands['edit'] = vorpal
      .command('edit', "edit this card's description.")
      .action(function (_, cb) {
        let newdesc = editInVim(card.desc)
        this.log('\n' + helpers.md(newdesc) + '\n')
        this.prompt({
          type: 'confirm',
          name: 'confirm',
          message: 'Are you really sure you want to replace the current desc with the one you just wrote?'
        }, res => {
          if (!res.confirm) return cb()
          Trello.putAsync(`/1/cards/${card.id}/desc`, {value: newdesc})
          .then(() => cb(chalk.bold('description edited!')))
          .catch(e => this.log(e.stack) && process.exit())
        })
      })

    session.current.vcommands['comment'] = vorpal
      .command('add comment [text...]', 'post a comment to this card')
      .alias('post')
      .action(function (args, cb) {
        let newcomment = editInVim((args.text || []).join(' ') || '')
        if (!newcomment.trim()) {
          cb()
        }
        this.log('\n' + helpers.md(newcomment) + '\n')
        this.prompt({
          type: 'confirm',
          name: 'confirm',
          message: 'Are you really sure you want to post this comment?'
        }, res => {
          if (!res.confirm) return cb()
          Trello.postAsync(`/1/cards/${card.id}/actions/comments`, {text: newcomment})
          .then(() => cb(chalk.bold('comment posted!')))
          .catch(e => this.log(e.stack) && process.exit())
        })
      })

    session.current.vcommands['comments'] = vorpal
      .command('comments', "list this card's comments.")
      .action(function (_, cb) {
        helpers.listComments.call(this)
        cb()
      })

    session.current.vcommands['checklists'] = vorpal
      .command('checklists', "show this card's checklists.")
      .action(function (_, cb) {
        helpers.listChecklists.call(this)
        cb()
      })

    session.current.vcommands['attachments'] = vorpal
      .command('attachments', "show this card's attachments.")
      .action(function (_, cb) {
        helpers.listAttachments.call(this)
        cb()
      })
  })
  .then(() => cb())
  .catch(e => this.log(e.stack) && process.exit())
}

function enterList (list, cb) {
  this.delimiter('entering ' + list.name + '...')
  return Trello.getAsync(`/1/lists/${list.id}`, {
    fields: 'id',
    cards: 'open',
    card_fields: 'name,desc,due'
  })
  .then(res => {
    vorpal.delimiter(helpers.color(helpers.slug(list)) + '~$')
    session.current.cards = res.cards
    helpers.listCards.call(this)
  })
  .then(() => {
    // clean old commands
    for (var k in session.current.vcommands) {
      session.current.vcommands[k].remove()
      delete session.current.vcommands[k]
    }

    // add new commands
    session.current.vcommands['add card'] = vorpal
      .command('add card <name...>', 'create a new card on this list.')
      .option('-t, --top', 'Put the card on the top of the list (default is bottom).')
      .option('-d, --due [val]', 'Set a due date.')
      .action(function (args, cb) {
        let data = {
          name: args.name.join(' '),
          desc: editInVim(''),
          pos: (args.options.top ? 'top' : 'bottom'),
          idList: list.id,
          due: (args.options.due ? (new Date(Date.parse(args.options.due))).toISOString() : null)
        }
        this.log('\n' + chalk.bold(data.name) + '\n' + helpers.md(data.desc) + '\n')
        this.prompt({
          type: 'confirm',
          name: 'confirm',
          message: 'Create this card?'
        }, res => {
          if (!res.confirm) return cb()
          Trello.postAsync(`/1/cards`, data)
          .then(() => cb(chalk.bold('card created!')))
          .catch(e => this.log(e.stack) && process.exit())
        })
      })

    session.current.cards.forEach(card => {
      let slug = helpers.slug(card)
      session.current.vcommands[slug] = vorpal
        .command(`card ${slug}`, `enters card '${card.name}'`)
        .alias(slug)
        .action(function (_, cb) {
          session.current.entity.unshift(card)
          enterCard.call(this, card, cb)
        })
    })
  })
  .then(() => cb())
  .catch(e => this.log(e.stack) && process.exit())
}

function enterBoard (board, cb) {
  this.delimiter('entering ' + board.name + '...')
  return Trello.getAsync(`/1/boards/${board.id}`, {
    fields: 'id',
    actions: 'all',
    actions_since: 'lastView',
    lists: 'open',
    list_fields: 'name',
    cards: 'open',
    card_fields: 'name,idList,desc,due'
  })
  .then(res => {
    vorpal.delimiter(helpers.color(helpers.slug(board)) + '~$')
    res.lists.forEach(l => {
      l.cards = []
      res.cards.forEach(c => {
        if (l.id === c.idList) {
          l.cards.push(c)
        }
      })
    })
    session.current.lists = res.lists
    helpers.listLists.call(this)
  })
  .then(() => {
    // clean old commands
    for (var k in session.current.vcommands) {
      session.current.vcommands[k].remove()
      delete session.current.vcommands[k]
    }

    // add new commands
    session.current.lists.forEach(list => {
      let slug = helpers.slug(list)
      session.current.vcommands[slug] = vorpal
        .command(`list ${slug}`, `enters list '${list.name}'`)
        .alias(slug)
        .action(function (_, cb) {
          session.current.entity.unshift(list)
          enterList.call(this, list, cb)
        })

      list.cards.forEach(card => {
        let slug = helpers.slug(card)
        session.current.vcommands[slug] = vorpal
          .command(`card ${slug}`, `enters card '${card.name}'`)
          .alias(slug)
          .action(function () {
            session.current.entity.unshift(card)
            enterCard.call(this, card, cb)
          })
      })
    })
  })
  .then(() => cb())
  .catch(e => this.log(e.stack) && process.exit())
}

function logged (cb) {
  this.delimiter('fetching your data...')
  return Trello.getAsync('/1/members/me', {
    fields: 'username',
    boards: 'open',
    board_fields: 'dateLastActivity,desc,name,memberships',
    board_memberships: 'active',
    board_lists: 'open',
    notifications: 'all',
    notifications_limit: 50
  })
  .then(res => {
    session.notifications = res.notifications.filter(d => d.unread)
    delete res.notifications
    session.current.boards = res.boards
    delete res.boards
    session.user = res
  })
  .then(() => {
    // clean old commands
    for (var k in session.current.vcommands) {
      session.current.vcommands[k].remove()
      delete session.current.vcommands[k]
    }

    // add new commands
    session.current.boards.forEach(board => {
      let slug = helpers.slug(board)
      session.current.vcommands[slug] = vorpal
        .command(`board ${slug}`, `enters board '${board.name}'`)
        .alias(slug)
        .action(function (_, cb) {
          session.current.entity.unshift(board)
          enterBoard.call(this, board, cb)
        })
    })
  })
  .then(() => {
    vorpal.delimiter(helpers.color(session.user.username + '@trello') + '~$')
    this.log(`connected as ${session.user.username}`)
    helpers.listBoards.call(this)
    cb()
  })
  .catch(e => this.log(e.stack) && process.exit())
}
