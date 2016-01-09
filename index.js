'use strict'

const editInVim = require('edit-in-vim')
const promisify = require('tiny-promisify')
const splitwords = require('split-words')

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
    'boards': [],
    'lists': [],
    'cards': [],
    'members': [],
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
      logged.call(this, userToken, cb)
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
        logged.call(this, result.token, cb)
      })
    }
  })

vorpal
  .command('cd ..')
  .action(function (_, cb) {
    let prevLevel = helpers.currentLevel()
    session.current.entity.shift()
    let level = helpers.currentLevel()

    if (prevLevel === 'card' && level === 'board') {
      /* do nothing */
    } else {
      /* eliminate all commands specific to the prevLevel */
      switch (prevLevel) {
        case 'list':
          session.current.cards.forEach(l => {
            let command = vorpal.find(helpers.slug(l))
            if (command) command.remove()
          })
          break
        case 'board':
          session.current.lists.forEach(l => {
            let command = vorpal.find(helpers.slug(l))
            if (command) command.remove()
          })
          break
      }
    }

    vorpal.exec('ls').then(cb).catch(e => this.log(e.stack) && process.exit())
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
    members: 'true',
    member_fields: 'username',
    checklists: 'all',
    checkItemStates: 'true',
    checklist_fields: 'name'
  })
  .then(res => {
    vorpal.delimiter(helpers.color(helpers.slug(card)) + '~$')
    session.current.level = 'card'
    session.current.entity.unshift(card)
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
    // edit cards
    var edit = vorpal.find('edit')
    if (edit) edit.remove()
    vorpal
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
          .then(() => cb())
          .catch(e => this.log(e.stack) && process.exit())
        })
      })

    // post a comment
    var comment = vorpal.find('comment')
    if (comment) comment.remove()
    vorpal
      .command('comment [text]', 'post a comment to this card')
      .action(function (args, cb) {
        let newcomment = editInVim(args.text || '')
        this.log('\n' + helpers.md(newcomment) + '\n')
        this.prompt({
          type: 'confirm',
          name: 'confirm',
          message: 'Are you really sure you want to post this comment?'
        }, res => {
          if (!res.confirm) return cb()
          Trello.postAsync(`/1/cards/${card.id}/actions/comments`, {text: newcomment})
          .then(() => cb())
          .catch(e => this.log(e.stack) && process.exit())
        })
      })

    // list comments
    var comments = vorpal.find('comments')
    if (comments) comments.remove()
    vorpal
      .command('comments', "list this card's comments.")
      .alias('ls comments')
      .action(function (_, cb) {
        helpers.listComments.call(this)
        cb()
      })

    // list checklists
    var checklists = vorpal.find('checklists')
    if (checklists) checklists.remove()
    vorpal
      .command('checklists', "show this card's checklists.")
      .alias('ls checklists')
      .action(function (_, cb) {
        helpers.listChecklists.call(this)
        cb()
      })

    // list attachments
    var attachments = vorpal.find('attachments')
    if (attachments) attachments.remove()
    vorpal
      .command('attachments', "show this card's attachments.")
      .alias('ls attachments')
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
    card_fields: 'name,desc,due,url'
  })
  .then(res => {
    vorpal.delimiter(helpers.color(helpers.slug(list)) + '~$')
    session.current.level = 'list'
    session.current.entity.unshift(list)
    session.current.cards = res.cards
    helpers.listCards.call(this)
  })
  .then(() => {
    session.current.cards.forEach(card => {
      let slug = helpers.slug(card)
      if (vorpal.find(slug)) return
      vorpal
        .command(slug, `enters card '${slug}'`)
        .action(function (_, cb) {
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
    members: 'all',
    member_fields: 'username',
    cards: 'open',
    card_fields: 'name,idList,desc,due,url'
  })
  .then(res => {
    vorpal.delimiter(helpers.color(helpers.slug(board)) + '~$')
    session.current.level = 'board'
    session.current.entity.unshift(board)
    res.lists.forEach(l => {
      l.cards = []
      res.cards.forEach(c => {
        if (l.id === c.idList) {
          l.cards.push(c)
        }
      })
    })
    session.current.lists = res.lists
    this.log(`members of this board:\n${res.members.map(m => ' - ' + m.username).join('\n')}`)
    helpers.listLists.call(this)
  })
  .then(() => {
    session.current.lists.forEach(list => {
      let slug = helpers.slug(list)
      if (vorpal.find(slug)) return
      vorpal
        .command(slug, `enters list '${slug}'`)
        .action(function (_, cb) {
          enterList.call(this, list, cb)
        })
    })
  })
  .then(() => cb())
  .catch(e => this.log(e.stack) && process.exit())
}

function logged (token, cb) {
  this.delimiter('fetching your data...')
  Trello.token = token
  return Trello.getAsync('/1/members/me', {
    fields: 'username',
    boards: 'open',
    board_fields: 'dateLastActivity,desc,name,url',
    notifications: 'all',
    notifications_limit: 50
  })
  .then(res => {
    session.current.level = 'user'
    session.notifications = res.notifications.filter(d => d.unread)
    delete res.notifications
    session.current.boards = res.boards
    delete res.boards
    session.user = res
  })
  .then(() => {
    session.current.boards.forEach(board => {
      let slug = helpers.slug(board)
      if (vorpal.find(slug)) return
      vorpal
        .command(slug, `enters board '${board.name}'`)
        .alias(`cd ${slug}`)
        .action(function (_, cb) {
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
