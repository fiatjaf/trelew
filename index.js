'use strict'

const editInVim = require('edit-in-vim')
const promisify = require('tiny-promisify')
const chalk = require('chalk')

var config = require('./config')

const Trello = new (require('node-trello'))(config.devKey)
Trello.getAsync = promisify(Trello.get, {context: Trello})
Trello.putAsync = promisify(Trello.put, {context: Trello})
Trello.postAsync = promisify(Trello.post, {context: Trello})
Trello.delAsync = promisify(Trello.del, {context: Trello})

global.session = module.exports.session = {
  'user': null,
  'notifications': null,
  'current': {
    'entity': [],
    'vcommands': [],
    'boards': [],
    'lists': [],
    'cards': [],
    'card': {},
    'checklists': [],
    'comments': [],
    'attachments': []
  }
}

const helpers = require('./helpers')

const vorpal = require('vorpal')()
vorpal
  .use('vorpal-less')
  .use('vorpal-repl')

/* changing default commands */
vorpal.find('help').alias('?')
vorpal.find('exit').description(`Exits ${config.name}.`)

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

    https://trello.com/1/connect?key=${config.devKey}&name=${config.name}&response_type=token&expires=never&scope=read,write

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

    global.session.current.entity.shift()
    let entity = global.session.current.entity[0]
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
        helpers.cardInfo.call(this)
    }
    cb()
  })

module.exports = vorpal.delimiter(helpers.color(config.name) + '~$')

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
    global.session.current.comments = res.actions
    global.session.current.attachments = res.attachments
    global.session.current.checklists = res.checklists
    global.session.current.card = card
  })
  .then(() => {
    // clean old commands
    for (var k in global.session.current.vcommands) {
      global.session.current.vcommands[k].remove()
      delete global.session.current.vcommands[k]
    }

    // add new commands
    global.session.current.vcommands['rename'] = vorpal
      .command('rename [text...]', 'rename this card')
      .alias('rename card')
      .action(function (args, cb) {
        let newname = editInVim((args.text || []).join('') || card.name)
        if (!newname) return cb('Not renamed.')

        this.log('\n' + helpers.md(newname))
        this.prompt({
          type: 'confirm',
          name: 'confirm',
          message: 'Are you really sure you want to replace the current name with the one you just wrote?'
        }, res => {
          if (!res.confirm) return cb()
          Trello.putAsync(`/1/cards/${card.id}/name`, {value: newname})
          .then(() => this.log(chalk.bold('renamed!')))
          .then(updateCard.bind(this, card))
          .then(cb)
          .catch(e => this.log(e.stack) && process.exit())
        })
      })

    global.session.current.vcommands['edit'] = vorpal
      .command('edit [text...]', "edit this card's description.")
      .alias('edit desc')
      .action(function (args, cb) {
        let newdesc = editInVim((card.desc || '') + (args.text || []).join(''))
        this.log('\n' + helpers.md(newdesc))
        this.prompt({
          type: 'confirm',
          name: 'confirm',
          message: 'Are you really sure you want to replace the current desc with the one you just wrote?'
        }, res => {
          if (!res.confirm) return cb()
          Trello.putAsync(`/1/cards/${card.id}/desc`, {value: newdesc})
          .then(() => this.log(chalk.bold('description edited!')))
          .then(updateCard.bind(this, card))
          .then(cb)
          .catch(e => this.log(e.stack) && process.exit())
        })
      })

    global.session.current.vcommands['comment'] = vorpal
      .command('post [text...]', 'post a comment to this card')
      .alias('add comment')
      .alias('comment')
      .action(function (args, cb) {
        let newcomment = editInVim((args.text || []).join(' ') || '')
        if (!newcomment.trim()) {
          cb()
        }
        this.log('\n' + helpers.md(newcomment))
        this.prompt({
          type: 'confirm',
          name: 'confirm',
          message: 'Are you really sure you want to post this comment?'
        }, res => {
          if (!res.confirm) return cb()
          Trello.postAsync(`/1/cards/${card.id}/actions/comments`, {text: newcomment})
          .then(() => this.log(chalk.bold('comment posted!')))
          .then(updateCard.bind(this, card))
          .then(cb)
          .catch(e => this.log(e.stack) && process.exit())
        })
      })

    global.session.current.vcommands['desc'] = vorpal
      .command('desc', "show this card's description.")
      .action(function (_, cb) {
        this.log('\n' + helpers.md(global.session.current.card.desc))
        cb()
      })

    global.session.current.vcommands['comments'] = vorpal
      .command('comments', "list this card's comments.")
      .action(function (_, cb) {
        helpers.listComments.call(this)
        cb()
      })

    global.session.current.vcommands['checklists'] = vorpal
      .command('checklists', "show this card's checklists.")
      .action(function (_, cb) {
        helpers.listChecklists.call(this)
        cb()
      })

    global.session.current.vcommands['attachments'] = vorpal
      .command('attachments', "show this card's attachments.")
      .action(function (_, cb) {
        helpers.listAttachments.call(this)
        cb()
      })
  })
  .then(() => {
    this.log(`entered card '${card.name}' ${card.due ? '(' + card.due.split('.')[0] + ')' : ''}`)
    helpers.cardInfo.call(this)
    this.log(`
type
'${chalk.underline('desc')}' to read this card's description ('${chalk.underline('desc | less')}' for long descriptions);
'${chalk.underline('edit')}' to edit and replace the description;
'${chalk.underline('comments')}' to read comments ('${chalk.underline('comments | less')}' for long comments);
'${chalk.underline('post')}' to write a new comment;
'${chalk.underline('checklists')}' to see checklists in this card;
'${chalk.underline('attachments')}' to see attachments in this card;
'${chalk.underline('ls')}' to show card information again; or
'${chalk.underline('cd ..')}' to go back to previous view.`)
  })
  .then(() => cb())
  .catch(e => this.log(e.stack) && process.exit())
}

function updateCard (card) {
  return Trello.getAsync(`/1/cards/${card.id}`, {
    fields: 'name,desc,due',
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
    global.session.current.card.desc = res.desc
    global.session.current.card.due = res.due
    global.session.current.card.name = res.name
    global.session.current.comments = res.actions
    global.session.current.attachments = res.attachments
    global.session.current.checklists = res.checklists
    global.session.current.card = card
  })
}

function updateList (list) {
  return Trello.getAsync(`/1/lists/${list.id}`, {
    fields: 'id',
    cards: 'open',
    card_fields: 'name,desc,due'
  })
  .then(res => {
    global.session.current.cards = res.cards
  })
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
    global.session.current.cards = res.cards
  })
  .then(() => {
    // clean old commands
    for (var k in global.session.current.vcommands) {
      global.session.current.vcommands[k].remove()
      delete global.session.current.vcommands[k]
    }

    // add new commands
    global.session.current.vcommands['add card'] = vorpal
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
        this.log('\n' + chalk.bold(data.name) + '\n' + helpers.md(data.desc))
        this.prompt({
          type: 'confirm',
          name: 'confirm',
          message: 'Create this card?'
        }, res => {
          if (!res.confirm) return cb()
          Trello.postAsync(`/1/cards`, data)
          .then(() => this.log(chalk.bold('card created!')))
          .then(updateList.bind(this, list))
          .then(cb)
          .catch(e => this.log(e.stack) && process.exit())
        })
      })

    global.session.current.cards.forEach(card => {
      let slug = helpers.slug(card)
      global.session.current.vcommands[slug] = vorpal
        .command(`card ${slug}`, `enters card '${card.name}'`)
        .alias(slug)
        .action(function (_, cb) {
          global.session.current.entity.unshift(card)
          enterCard.call(this, card, cb)
        })
    })
  })
  .then(() => {
    this.log(`entered list ${list.name}`)
    helpers.listCards.call(this)
    this.log(`\n
type the name of a card to enter it;
'${chalk.underline('add card')}' to add a card;
'${chalk.underline('ls')}' to list cards again; or
'${chalk.underline('cd ..')}' to go back to board view.`)
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
    global.session.current.lists = res.lists
  })
  .then(() => {
    // clean old commands
    for (var k in global.session.current.vcommands) {
      global.session.current.vcommands[k].remove()
      delete global.session.current.vcommands[k]
    }

    // add new commands
    global.session.current.lists.forEach(list => {
      let slug = helpers.slug(list)
      global.session.current.vcommands[slug] = vorpal
        .command(`list ${slug}`, `enters list '${list.name}'`)
        .alias(slug)
        .action(function (_, cb) {
          global.session.current.entity.unshift(list)
          enterList.call(this, list, cb)
        })

      list.cards.forEach(card => {
        let slug = helpers.slug(card)
        global.session.current.vcommands[slug] = vorpal
          .command(`card ${slug}`, `enters card '${card.name}'`)
          .alias(slug)
          .action(function () {
            global.session.current.entity.unshift(card)
            enterCard.call(this, card, cb)
          })
      })
    })
  })
  .then(() => {
    this.log(`entered board ${board.name}`)
    helpers.listLists.call(this)
    this.log(`\n
type the name of a list to enter it;
type the name of a card to enter it;
'${chalk.underline('ls')}' to list lists again; or
'${chalk.underline('cd ..')}' to go back to board selection`)
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
  .catch(e => {
    this.log('Invalid token: "' + Trello.token + '"')
    config.store.set('token', undefined)
    this.log(`Please start ${config.name} again and provide a valid token.`)
    process.exit()
  })
  .then(res => {
    global.session.notifications = res.notifications.filter(d => d.unread)
    delete res.notifications
    global.session.current.boards = res.boards
    delete res.boards
    global.session.user = res
  })
  .then(() => {
    // clean old commands
    for (var k in global.session.current.vcommands) {
      global.session.current.vcommands[k].remove()
      delete global.session.current.vcommands[k]
    }

    // add new commands
    global.session.current.boards.forEach(board => {
      let slug = helpers.slug(board)
      global.session.current.vcommands[slug] = vorpal
        .command(`board ${slug}`, `enters board '${board.name}'`)
        .alias(slug)
        .action(function (_, cb) {
          global.session.current.entity.unshift(board)
          enterBoard.call(this, board, cb)
        })
    })
  })
  .then(() => {
    let authCommand = vorpal.find('auth')
    if (authCommand) authCommand.remove()
    vorpal.delimiter(helpers.color(global.session.user.username + '@trello') + '~$')
    this.log(`connected as ${global.session.user.username}`)
    helpers.listBoards.call(this)
    this.log(`
type the name of a board to enter it;
or '${chalk.underline('ls')}' to list them again.`)
    cb()
  })
  .catch(e => this.log(e.stack) && process.exit())
}
