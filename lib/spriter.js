var FS = require('fs'),
    VOW = require('vow'),
    PATH = require('path'),
    CRYPTO = require('crypto'),
    EXTEND = require('extend'),
    GLOBULE = require('globule'),
    IM = require('imagemagick'),
    Mapper = require('mapper');

var colors = require('colors');

/**
 * @typedef {Object} SpriteConfig
 * @property {String} [out = './sprited']
 * @property {String} [name = 'common']
 * @property {String} [ext = 'png']
 * @property {String} [layout = 'smart']
 * @property {String|Number|Number[]} [padding = 1]
 * @property {String|Ifexists} [ifexists = 'create']
 *
 * @typedef {Object} Ifexists
 * @property {String} [action = 'create']
 * @property {SpriteConfig} [config]
 *
 * @constructor
 * @param {SpriteConfig} config
 * @param {Mapper} mapper
 */
var Spriter = function(config, mapper) {
    this.path = PATH.relative('.', config.path);
    this.name = config.name;
    this.ext = config.ext.replace(/^\./, '');

    this.mapper = mapper;
    this.cache = '';
};

/**
 * @static
 * @type {SpriteConfig}
 */
Spriter._defaultSpriteConfig = {
    path : './sprited',
    name : 'common',
    ext : 'png',
    layout : 'smart',
    padding : 2,
    ifexists : 'create',
    cache_path : './.spriter.json'
};

/**
 * @static
 * @private
 * @type {String}
 */
Spriter._configVersion = '0.1.0';

/**
 * @static
 * @type {RegExp}
 */
Spriter._spritableImgExtsRe = /\.(jpg|jpeg|gif|ico|png)$/;

/**
 * Sprite images
 * @static
 * @param {SpriteConfig} config
 * @returns {VOW.Deferred}
 */
Spriter.make = function(config) {
    var images = Spriter._findImages(config.src);

    if (images.length === 0) {
        return VOW.reject('Require at least one image to make sprite');
    }

    config = EXTEND({}, Spriter._defaultSpriteConfig, config);
    config.padding = Spriter._parsePadding(config.padding);

    return Spriter
        ._prepareImages(images, config)
        .then(function(preparedImages) {
            return Spriter._make(config, preparedImages);
        })
        .then(function(sprites) {
            var imagesBySprite = {};

            // Map input and sprited images
            images = images.map(function(image) {
                var id = image.id;

                sprites.some(function(sprite) {
                    var processedImages = sprite._images;

                    return processedImages.some(function(processedImage) {
                        if (processedImage.ids.indexOf(id) !== - 1) {
                            image.spriteUrl = sprite.url;
                            image.positionX = processedImage.positionX;
                            image.positionY = processedImage.positionY;
                            image.height = processedImage.height;
                            image.width = processedImage.width;
                            image.padding = processedImage.padding;
                            image.sum = processedImage.sum;
                            image.num = processedImage.num;

                            imagesBySprite[sprite.url] || (imagesBySprite[sprite.url] = []);
                            imagesBySprite[sprite.url].push(image);

                            return true;
                        }
                    });
                });

                return image;
            });

            // Write processed sprites
            return VOW.all(sprites.map(function(sprite) {
                return sprite.write(imagesBySprite[sprite.url]);
            }));
        })
        .then(function(sprites) {
            return [ images, sprites ];
        });
};

/**
 * @static
 * @private
 * @param {String|String[]} src Globbing pattern(s)
 * @returns {SpriteImage[]} Found images
 */
Spriter._findImages = function(src) {
    Array.isArray(src) || (src = [ src ]);

    var imagePaths = [],
        patterns = src.filter(function(path) {
            if (typeof path === 'string' && path.indexOf('*') === -1 && Spriter._isImageSpritable(path)) {
                imagePaths.push(path);

                return false;
            } else if (Spriter._isImageSpritable(path)) {
                imagePaths.push(path);

                return false;
            }

            return true;
        }),
        foundImages;

    foundImages = imagePaths
        .concat(GLOBULE.find(patterns) || [])
        .reduce(function(images, imagePath) {
            if (Spriter._isImageSpritable(imagePath)) {
                images.push(typeof imagePath === 'string' ?
                    { url : imagePath } :
                    imagePath);
            }

            return images;
        }, []);

    return foundImages;
};

/**
 * @static
 * @private
 * @param {String|SpriteImage} image
 * @returns {Boolean} Is it possible to sprite this image
 */
Spriter._isImageSpritable = function(image) {
    var imagePath = image && typeof image === 'string' ?
            image :
            image.url;

    return Spriter._spritableImgExtsRe.test(imagePath);
};

/**
 * @static
 * @private
 * @param {String} content
 * @returns {Number[]} Parsed padding
 */
Spriter._parsePadding = function(content) {
    var padding = [ 0, 0, 0, 0 ];

    if (typeof content === 'string') {
        content = content
            .split(',')
            .map(function(p) {
                return p.trim();
            });
    } else if (typeof content === 'number') {
        content = [ content ];
    }

    if (Array.isArray(content)) {
        padding = [
            content[0],
            content[1] || content[0],
            content[2] || content[0],
            content[3] || content[1] || content[0]
        ]
        .map(function(v) {
            return parseInt(v, 10);
        });
    }

    return padding;
};

Spriter.writing = null;

/**
 * @static
 * @param {SpriteImage[]} images
 * @returns {Image[]} Prepared images
 */
Spriter._prepareImages = function(images, config) {
    var imagesByUrl = {},
        cache;

    try {
        cache = require(PATH.resolve(config.cache_path));
    } catch(e) {
        cache = {};
    }

    return VOW
        // merge by url
        .all(images.reduce(function(readingPromises, img) {
            var image,
                hashSum;

            if (typeof img === 'string') {
                img = { url : img };
            }

            if ( ! Spriter._isImageSpritable(img)) {
                return readingPromises;
            }

            img.padding = img.padding ?
                Spriter._parsePadding(img.padding) :
                config.padding;

            if ( ! img.id) {
                hashSum = CRYPTO.createHash('sha1');
                hashSum.update(JSON.stringify(img));
                hashSum = hashSum.digest('hex');

                img.id = hashSum;
            }

            image = imagesByUrl[img.url];

            if (image) {
                image.ids.push(img.id);
                img.padding && (image.padding = image.padding
                    .map(function(p, i) {
                        return p > img.padding[i] ? p : img.padding[i];
                    }, 0));
            } else {
                imagesByUrl[img.url] = Spriter._createImage(img);
                readingPromises.push(Spriter._getImageDimensions(imagesByUrl[img.url], cache));
            }

            return readingPromises;
        }, []))
        .then(function(preparedImages) {
            // merge by hashsum
            preparedImages.forEach(function(acceptor, j) {
                preparedImages.forEach(function(donor, i) {
                    if (i !== j && acceptor.sum === donor.sum) {
                        acceptor.ids = acceptor.ids.concat(donor.ids);
                        preparedImages.splice(i, 1);
                    }
                });
            });

            function next() {
                var defer = VOW.defer(),
                    cachePath = PATH.resolve(config.cache_path),
                    actualCache;

                try {
                    actualCache = JSON.parse(FS.readFileSync(cachePath, 'utf8'));
                    cache = EXTEND({}, actualCache, cache);
                } catch(e) {}

                FS.writeFile(cachePath, JSON.stringify(cache), function() {
                    Spriter.writing = null;
                    defer.resolve();
                });

                return defer.promise();
            }

            Spriter.writing = Spriter.writing ?
                Spriter.writing.then(next) :
                next();

            return preparedImages;
        });
};

Spriter._createImage = function(imageData) {
    var image = {};

    image.ids = [ imageData.id || String(Math.random()).substr(2, 10) ];
    image.url = PATH.relative('.', imageData.url);

    image.positionX = imageData.position && imageData.position.x || 0;
    image.positionY = imageData.position && imageData.position.y || 0;
    image.padding = imageData.padding || [ 0, 0, 0, 0 ];

    return image;
};

Spriter._getImageDimensions = function(image, cache) {
    var deferred = VOW.defer();

    FS.readFile(image.url, function(err, content) {
        if (err) {
            return deferred.reject(err);
        }

        var numsLen = 3,
            rx = /\d/g,
            num = '';

        image.sum = CRYPTO
            .createHash('sha1')
            .update(content)
            .digest('hex');

        while (--numsLen >= 0) {
            num += String(rx.exec(image.sum)[0]);
        }

        image.num = parseInt(num, 10);

        var dims = cache && cache[image.sum];

        if ( ! dims) {
            IM.identify(image.url, function(err, img) {
                if (err) {
                    return deferred.reject(err);
                }

                dims = cache[image.sum] = { width : img.width, height : img.height };

                deferred.resolve(dims);
            });
        } else {
            deferred.resolve(dims);
        }
    });

    return deferred.promise()
        .then(function(dims) {
            image.width = dims.width;
            image.height = dims.height;
            image.totalWidth = image.padding[3] + image.width + image.padding[1];
            image.totalHeight = image.padding[0] + image.height + image.padding[2];

            return image;
        });
};

/**
 * Process sprites
 * @static
 * @private
 * @param {SpriteConfig} config
 * @param {Image[]} images
 * @returns {VOW.Deferred} Array of processed sprites
 */
Spriter._make = function(config, images) {
    var spriter = this,
        ifexists,
        spritedImages,
        diffImages,
        existSprite,
        spriteProcess;

    existSprite = spriter._restoreSprite(PATH.join(config.path, config.name + '.json'));

    // if sprite with the same url is found
    if (existSprite) {
        spritedImages = existSprite._images;

        // compare images and get not sprited
        diffImages = spritedImages &&
            images.reduce(function(diffImages, image) {
                var isFound;

                spritedImages && spritedImages.some(function(spritedImage) {
                    // compare hashsums
                    if (spritedImage.sum === image.sum) {
                        var isPaddingAllowed = ! image.padding;

                        // compare paddings
                        isPaddingAllowed || (isPaddingAllowed = spritedImage.padding.some(function(oldP, i) {
                            return oldP <= image.padding[i];
                        }));

                        if (isPaddingAllowed) {
                            // already sprited! just concat ids to use processed image data
                            spritedImage.ids = spritedImage.ids.concat(image.ids);
                            isFound = true;
                        }

                        return true;
                    }
                });

                isFound || diffImages.push(image);

                return diffImages;
            }, []);

        ifexists = config.ifexists;

        // if imagesets are different
        if (diffImages && diffImages.length) {
            if (ifexists === 'add' || ifexists.action === 'add') {
                // use already sprited images and add diff ones
                spriteProcess = spriter._add(existSprite, diffImages);
            } else if (ifexists === 'safeAdd' || ifexists.action === 'safeAdd') {
                // use already sprited images and add the diff ones, ensure saving previous positions
                spriteProcess = spriter._safeAdd(existSprite, diffImages);
            } else if (ifexists === 'use' || ifexists.action === 'use') {
                // use already sprited images and create a new sprite for the diff ones
                spriteProcess = spriter._use(existSprite, diffImages, ifexists.config);
            } else {
                // create new sprite for source images and override previous one
                spriteProcess = spriter._create(config, images);
            }
        // if configs are different
        } else if (
            (ifexists === 'create' || ifexists.action === 'create') &&
            (existSprite.mapper.layout !== config.layout || existSprite.mapper.padding !== config.padding)
        ) {
            // create new sprite for source images
            spriteProcess = spriter._create(config, images);
        } else {
            // use already sprited images
            spriteProcess = existSprite;
        }
    } else {
        // create new sprite for source images
        spriteProcess = spriter._create(config, images);
    }

    return VOW.all([].concat(spriteProcess));
};

/**
 * Create new sprite
 * @static
 * @private
 * @param {SpriteConfig|Spriter} sprite
 * @param {Image[]} images
 * @returns {VOW.Deferred}
 */
Spriter._create = function(sprite, images) {
    if ( ! (sprite instanceof Spriter)) {
        sprite = Spriter._createSprite(sprite);
    }

    return sprite.make(images);
};

/**
 * Restore existing sprite and extend it with extra images
 * @static
 * @private
 * @param {SpriteConfig|Spriter} sprite
 * @param {Image[]} images
 * @returns {VOW.Deferred}
 */
Spriter._add = function(sprite, images) {
    if ( ! (sprite instanceof Spriter)) {
        sprite = Spriter._restoreSprite(sprite);
    }

    return sprite.add(images);
};

/**
 * Restore existing sprite and extend it with extra images, without modifying current images positions
 * @static
 * @private
 * @param {SpriteConfig|Spriter} sprite
 * @param {Image[]} images
 * @returns {VOW.Deferred}
 */
Spriter._safeAdd = function(sprite, images) {
    if ( ! (sprite instanceof Spriter)) {
        sprite = Spriter._restoreSprite(sprite);
    }

    return sprite.safeAdd(images);
};

/**
 * Restore existing sprite and create new one if `newConfig` is defined
 * @static
 * @private
 * @param {SpriteConfig|Spriter} sprite
 * @param {Image[]} images
 * @param {SpriteConfig} newConfig
 * @returns {VOW.Deferred}
 */
Spriter._use = function(sprite, images, newConfig) {
    var spriteProcess = [];

    if ( ! (sprite instanceof Spriter)) {
        sprite = Spriter._restoreSprite(sprite);
    }

    spriteProcess.push(sprite);

    newConfig = EXTEND({
        layout : sprite.mapper.layout,
        padding : sprite.mapper.padding,
        path : sprite.path,
        ext : sprite.ext,
        name : 'extended_' + sprite.name
    }, newConfig || {});

    spriteProcess.push(Spriter._create(newConfig, images));

    return spriteProcess;
};

/**
 * @static
 * @private
 * @param {SpriteConfig} config
 * @returns {?Spriter} New sprite
 */
Spriter._createSprite = function(config) {
    var mapperConfig = {
            layout : config.layout || 'smart',
            deep_level : config.deep || 9,
            padding : config.padding
        },
        mapper,
        sprite;

    mapper = new Mapper(mapperConfig);

    if (mapper) {
        sprite = new Spriter(config, mapper);
    }

    return sprite;
};

/**
 * @static
 * @private
 * @param {SpriteConfig|String} config or config path
 * @returns {?Spriter} Restored sprite
 */
Spriter._restoreSprite = function(config) {
    var parsedConfig,
        sprite,
        mapper;

    if (typeof config === 'string') {
        parsedConfig = Spriter._parseSpriteConfig(config);
    }

    if (parsedConfig && parsedConfig.sprite) {
        mapper = new Mapper(parsedConfig.sprite.mapper);

        if (mapper) {
            sprite = new Spriter(parsedConfig.sprite, mapper);
            sprite.parsedConfig = parsedConfig;
            sprite.isRestored = true;
        }
    }

    return sprite;
};

/**
 * Find and parse sprite config
 * @static
 * @private
 * @param {String} path
 * @returns {?Object}
 */
Spriter._parseSpriteConfig = function(path) {
    var exSpriteConfig;

    if (FS.existsSync(path)) {
        try {
            exSpriteConfig = JSON.parse(FS.readFileSync(path));

            if (exSpriteConfig.meta.version !== Spriter._configVersion) {
                throw('old version');
            }
        } catch (e) {
            e instanceof SyntaxError ?
                console.error('Invalid sprite config: ' + path) :
                console.error('Sprite config not found: ' + path);
        }
    }

    return exSpriteConfig;
};

/**
 * Make dirs if not exists.
 * @private
 * @param {String} path Path to make.
 */
Spriter._makePath = function(path) {
    var dirs = PATH.dirname(path).split(PATH.sep),
        _path = '';

    dirs.forEach(function(dir) {
        dir = dir || PATH.sep;

        if (dir) {
            _path = PATH.join(_path, dir);
            if ( ! FS.existsSync(_path)) {
                FS.mkdirSync(_path);
            }
        }
    });
};

Spriter.log = (function() {
    function zeros(s, l) {
        s = String(s);
        while (s.length < l) {
            s = '0' + s;
        }
        return s;
    }

    return function(action, scope) {
        var dt = new Date();

        console.log(
            colors.grey(
                zeros(dt.getHours(), 2) + ':' +
                zeros(dt.getMinutes(), 2) + ':' +
                zeros(dt.getSeconds(), 2) + '.' +
                zeros(dt.getMilliseconds(), 3) + ' - ' +
                '[' + colors.magenta('Spriter') + '] '+
                '[' + colors.cyan(action) + '] ' +
                colors.blue(scope)
            )
        );
    };
})();

/**
 * Make sprite
 * @param {Object[]} images
 * @returns {Spriter}
 */
Spriter.prototype.make = function(images) {
    this.mapper
        .add(images)
        .map();

    return this;
};

/**
 * Extend sprite with images
 * @param {Object[]} images
 * @returns {Spriter}
 */
Spriter.prototype.add = function(images) {
    var mapper = this.mapper;

    images.forEach(function(image) {
        mapper.add(image);
    });

    mapper.map();

    return this;
};

/**
 * Extend sprite with images without modifying current images positions
 * @param {Object[]} images
 * @returns {Spriter}
 */
Spriter.prototype.safeAdd = function(images) {
    var mapper = this.mapper;

    images.forEach(function(image) {
        mapper.safeAdd(image);
    });
    mapper.map();

    return this;
};

/**
 * Write sprite
 * @private
 * @param {Object[]} images
 * @returns {VOW.Deferred} Sprite
 */
Spriter.prototype.write = function(images) {
    var sprite = this,
        promise = VOW.defer(),
        spritedImages = sprite._images,
        cnfgPath = PATH.join(sprite.path, sprite.name + '.json'),
        exist = Spriter._parseSpriteConfig(cnfgPath),
        config = {},
        commands,
        hashsum;

    config.sprite = sprite;
    config.images = images
        .sort(function(a, b) { return a.num - b.num; })
        .map(function(image) {
            image.url = PATH.relative('.', image.url);

            return image;
        });

    hashsum = CRYPTO.createHash('sha1');
    hashsum.update(JSON.stringify(config));
    hashsum = hashsum.digest('hex');

    if (exist && hashsum === exist.meta.hashsum) {
        promise.resolve('IsValid');
    } else {
        if (spritedImages && spritedImages.length) {

            // define blank canvas
            commands = [
                '-define', 'png:exclude-chunks=date',
                '-size', sprite._width + 'x' + sprite._height, 'xc:none'
            ];

            // define images
            spritedImages.forEach(function(image) {
                commands.push(image.url,
                    '-geometry',
                        '+' + (parseInt(image.positionX, 10) + image.padding[3]) +
                        '+' + (parseInt(image.positionY, 10) + image.padding[2]),
                    '-composite'
                );
            });

            // define output path
            commands.push(sprite.url);
            Spriter._makePath(sprite.url);

            // convert and write
            IM.convert(commands, function(err) {
                if (err) {
                    return promise.reject(err);
                }

                config.meta = {
                    version : Spriter._configVersion,
                    hashsum : hashsum
                };

                // write config
                FS.writeFile(cnfgPath, JSON.stringify(config), function(err) {
                    if (err) {
                        promise.reject(err);
                    } else {
                        promise.resolve(exist ? 'Rebuild' : 'Build');
                    }
                });
            });
        } else {
            promise.reject('There are no mapped images to write');
        }
    }

    return promise.promise()
        .then(function(state) {
            Spriter.log(colors.green(state), sprite.url);
        })
        .fail(function(e) {
            Spriter.log(colors.red('Failed'), sprite.url, e);
        })
        .always(function() {
            return sprite;
        });
};

Object.defineProperties(
    Spriter.prototype, {
        url : {
            get : function() {
                return PATH.relative('.', PATH.resolve(this.path, this.name + '.' + this.ext));
            }
        },
        _width : {
            get : function() {
                return this.mapper.width;
            }
        },
        _height : {
            get : function() {
                return this.mapper.height;
            }
        },
        _images : {
            get : function() {
                return this.mapper.items;
            }
        }
    }
);

module.exports = Spriter;
