# Spriter

> Generates horizontal, vertical and smart(compact) sprites.

> Can add images to existent sprites without modifying other images positions. 

> Can get positions from existent sprites for already sprited images and create new sprite for other.

## Requirements

Spriter requires [node-imagemagick](https://github.com/naltatis/node-imagemagick) which depends on [Imagemagick](http://www.imagemagick.org/).

There are many ways to install Imagemagick. For example, if you are using OS X, you can use Homebrew: `brew install imagemagick`.

## Install

Install with [npm](https://npmjs.org/package/spriter):

```
npm install spriter --save
```

If you want to use `spriter` on your cli install with:

```
npm install spriter -g
```

## Command Line Interface
```
Usage: spriter -s <src>...[options]

src     glob string(s) or file path(s) to find source images to put into the sprite

Options:
   -o, --out        path of directory to write sprite file to  [./sprited]
   -n, --name       name of sprite file  [common]
   -e, --ext        extension of sprite file  [png]
   -i, --ifexists   action for already existent sprite  [override]
   -p, --padding    tiles padding in px   [1]
   -l, --layout     layout of the sprite image  [smart]
```

## Programatic usage
```
var spriter = require('spriter');

spriter.make(options).then(cb);
```

### Options
* **src:**      Glob string(s) or file path(s) to find source images to put into the sprite  [required]
* **out:**      Path of directory to write sprite file to  [./sprited]
* **name:**     Name of sprite file  [common]
* **ext:**      Extension of sprite file  [png]
* **ifexists:** Action for already existent sprite: override, add or use  [override]
* **padding:**  Tiles padding in px  [1]
* **layout:**   Layout of the sprite image: smart, horizontal or vertical  [smart]

### Examples
```
var Spriter = require('spriter');

Spriter
    .make({
        src : [ './examples/_images/a/**', './examples/_images/b/1.png' ],
        out : './examples/sprited',
        name : 'main',
        padding : [ 2, 4 ]
    })
    .spread(function(images, sprites) {
        console.log('done');
    });
```

Check more examples at [/examples](/examples/).
