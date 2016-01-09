# trelew

![](trelew.jpg)

### An immersive command line app for Trello

## Install

```
sudo npm install trelew --global
```

## Run

```
trelew
```

On the first run you'll be asked to generate a token.

After that, you can navigate between your boards, lists and cards just by typing their name (just start typing and press TAB for autocompletion). For visualizing available options and information about current board/list/card, type `ls`.

Once in a card, type `ls` to read its descrition, `edit` to edit the description, `comments` to read the last comments, `comment` to add a new comment, `checklists` and `attachments` to see checklists and attachments.

`cd ..` will go back to the previous level.

`?` or `help` will show the available commands.
