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
$ [sudo] npm install spriter --save
```

If you want to use `spriter` on your cli install with:

```
$ [sudo] npm install spriter -g
```

### CLI

Usage:
```
$ spriter <src> <output> [options...]

src     Glob string(s) or file path(s) to find source images for spriting
output  Output sprite filepath
```

Options:
```
    -h, --help : Help
    -v, --version : Version
    -o OUTPUT, --output=OUTPUT : Path of directory to write sprite file to [./sprites]
    -n NAME, --name=NAME : Name of sprite file  [common]
    -e EXTENSION, --ext=EXTENSION : Extension of sprite file  [png]
    -i IFEXISTS, --ifexists=IFEXISTS : Action for already existent sprite  [override]
    -l LAYOUT, --layout=LAYOUT : Layout of the sprite image  [smart]
    -p PADDINGS, --padding=PADDINGS : Tiles padding in px  [2]
```

Example:
```
    $ spriter '**/*.png' -o './sprited' -n 'common'
```

### JS API

Usage:
```
var spriter = require('spriter');

spriter.api(options).then(cb);
```

Options:
* **src:**      Glob string(s) or file path(s) to find source images to put into the sprite  [required]
* **path:**     Path of directory to write sprite file to  [./sprites]
* **name:**     Name of sprite file  [common]
* **ext:**      Extension of sprite file  [png]
* **ifexists:** Action for already existent sprite: override, add or use  [override]
* **layout:**   Layout of the sprite image: smart, horizontal or vertical  [smart]
* **padding:**  Tiles padding in px  [2]

Example:
```
var Spriter = require('spriter');

Spriter
    .api({
        src : [ '**/*.png' ],
        path : './sprited',
        name : 'common'
    })
    .spread(function(images, sprites) {
        console.log('done');
    });
```

Checkout more examples at [/examples](https://github.com/vindm/spriter/tree/r2/examples) and [/tests](https://github.com/vindm/spriter/tree/r2/tests).
