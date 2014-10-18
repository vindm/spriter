# Spriter

Creates sprite images.

> * Generates horizontal, vertical and smart(compact) sprites.

> * Can add images to existent sprites without modifying other images positions. 

> * Can get positions from existent sprites for already sprited images and create new sprite for other.

## Requirements

Spriter requires [node-imagemagick](https://github.com/naltatis/node-imagemagick) which depends on [Imagemagick](http://www.imagemagick.org/).

There are many ways to install Imagemagick. For example, if you are using OS X, you can use Homebrew: `brew install imagemagick`.

## Usage

Install with [npm](https://npmjs.org/package/spriter):

```
npm install spriter --save
```

If you want to use `spriter` on your cli install with:

```
npm install spriter -g
```

### CLI
```
Usage: spriter -s <src>...[options]

src     glob string(s) or file path(s) to find source images to put into the sprite

Options:
   -p, --path       path of directory to write sprite file to  [./sprited]
   -n, --name       name of sprite file  [common]
   -e, --ext        extension of sprite file  [png]
   -i, --ifexists   action for already existent sprite  [override]
   -p, --padding    tiles padding in px   [1]
   -l, --layout     layout of the sprite image  [smart]
```

### JS API
```
var spriter = require('spriter');

spriter.api(options).then(cb);
```

### Options
* **src:**      Glob string(s) or file path(s) to find source images to put into the sprite  [required]
* **path:**     Path of directory to write sprite file to  [./sprites]
* **name:**     Name of sprite file  [common]
* **ext:**      Extension of sprite file  [png]
* **ifexists:** Action for already existent sprite: override, add or use  [override]
* **layout:**   Layout of the sprite image: smart, horizontal or vertical  [smart]
* **padding:**  Tiles padding in px  [2]

### Examples
```
var Spriter = require('spriter');

Spriter
    .api({
        src : [ './examples/_images/a/**', './examples/_images/b/1.png' ],
        path : './examples/sprited',
        name : 'main',
        ext : 'png',
        padding : [ 2, 4 ]
    })
    .spread(function(images, sprites) {
        console.log('done');
    });
```

Checkout more examples at [/examples](https://github.com/vindm/spriter/tree/r2/examples) and [/tests](https://github.com/vindm/spriter/tree/r2/tests).
