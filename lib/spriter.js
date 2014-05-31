var FS = require('fs'),
    VOW = require('vow'),
    PATH = require('path'),
    EXTEND = require('extend'),
    GLOBULE = require('globule'),
    IM = require('imagemagick'),
    Mapper = require('mapper'),
    Image = require('./image');

/**
 * @typedef {Object} SpriteConfig
 * @property {String} [out = ./sprited]
 * @property {String} [name = common]
 * @property {String} [ext = png]
 * @property {String} [layout = smart]
 * @property {String|Number|Number[]} [padding = 1]
 * @property {String|Ifexists} [ifexists = create]
 *
 * @typedef {Object} Ifexists
 * @property {String} [action = create]
 * @property {SpriteConfig} [config]
 *
 * @constructor
 * @param {SpriteConfig} config
 * @param {Mapper} mapper
 */
var Spriter = function(config, mapper) {
    this.out = config.out;
    this.name = config.name;
    this.ext = config.ext.replace(/^\./, '');

    this.mapper = mapper;
};

/**
 * @static
 * @type {SpriteConfig}
 */
Spriter._defaultSpriteConfig = {
    out : './sprited',
    name : 'common',
    ext : 'png',
    layout : 'smart',
    padding : 1,
    ifexists : 'create'
};

/**
 * @static
 * @private
 * @type {String}
 */
Spriter._configVersion = "0.1.0";

/**
 * @static
 * @type {RegExp}
 */
Spriter._spritableImgExtsRe = /\.(jpg|jpeg|gif|ico|png)$/;

/**
 * @typedef {Object} SpriteImage
 * @property {String} url
 * @property {String|Number} [id]
 * @property {Number[]} [padding]
 *
 * Sprite images
 * @static
 * @param {SpriteConfig} config
 * @param {SpriteImage[]} [images]
 * @returns {VOW.Deferred} Sprited images
 */
Spriter.make = function(config) {
    var images = Spriter._findImages(config.src);

    if (images.length < 1) {
        return VOW.reject(new Error('Require at least one image to make sprite'));
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
                        if (processedImage.ids.indexOf(id) !== -1) {
                            image.spriteUrl = sprite.url;
                            image.positionX = processedImage.positionX;
                            image.positionY = processedImage.positionY;
                            image.height = processedImage.height;
                            image.width = processedImage.width;
                            image.sum = processedImage.sum;

                            imagesBySprite[sprite.url] || (imagesBySprite[sprite.url] = []);
                            imagesBySprite[sprite.url].push(image);

                            return true;
                        }
                    });
                });

                return image;
            });

            // Write processed sprites configs
            return VOW
                .all(sprites.map(function(sprite) {
                    return Spriter._writeSpriteConfig(sprite, imagesBySprite[sprite.url]);
                }))
                .then(function() {
                    return sprites;
                });
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
            if (Spriter._isImageSpritable(path)) {
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

/**
 * @static
 * @param {SpriteImage[]} images
 * @returns {Image[]} Prepared images
 */
Spriter._prepareImages = function(images, config) {
    var imagesByUrl = {};

    return VOW
        // merge by url
        .all(images.reduce(function(readingPromises, img) {
            var image;

            if (typeof img === 'string') {
                img = { url : img };
            }

            if ( ! Spriter._isImageSpritable(img)) {
                return readingPromises;
            }

            img.id || (img.id = String(Math.random()).substr(2, 10));
            img.padding = img.padding ?
                Spriter._parsePadding(img.padding) :
                config.padding;

            image = imagesByUrl[img.url];

            if (image) {
                image.ids.push(img.id);
                img.padding && (image.padding = image.padding
                    .map(function(p, i) {
                        return p > img.padding[i] ? p : img.padding[i];
                    }, 0));
            } else {
                imagesByUrl[img.url] = new Image(img);
                readingPromises.push(imagesByUrl[img.url].readDimensions());
            }

            return readingPromises;
        }, []))
        // merge by hashsum
        .then(function(preparedImages) {
            preparedImages.forEach(function(acceptor, j) {
                preparedImages.forEach(function(donor, i) {
                    if (i !== j && acceptor.sum === donor.sum) {
                        acceptor.ids = acceptor.ids.concat(donor.ids);
                        preparedImages.splice(i, 1);
                    }
                });
            });

            return preparedImages;
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

    existSprite = spriter._restoreSprite(PATH.join(config.out, config.name + '.json'));

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
                        isPaddingAllowed ||
                            (isPaddingAllowed = spritedImage.padding
                                .some(function(oldP, i) {
                                    return oldP <= image.padding[i];
                                }));

                        if (isPaddingAllowed) {
                            // already sprited! just concat ids to use data of sprited image
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
                // use already sprited images and add the diff ones
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
            (existSprite.mapper.layout !== config.layout) ||
            (existSprite.mapper.padding !== config.padding)
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

    return sprite.make(images).write();
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

    return sprite.add(images).write();
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

    return sprite.safeAdd(images).write();
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
        out : sprite.out,
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
 * Prepare and write sprite config
 * @static
 * @private
 * @param {Spriter} sprite
 * @param {SpriteImage[]} images
 * @returns {VOW.Deferred}
 */
Spriter._writeSpriteConfig = function(sprite, images) {
    var promise = VOW.promise(),
        cnfgPath = PATH.join(sprite.out, sprite.name + '.json'),
        config = {};

    config.images = images;
    config.sprite = sprite;
    config.meta = {
        version : Spriter._configVersion,
        created : Date.now()
    };

    Spriter._makePath(cnfgPath);
    FS.writeFile(cnfgPath, JSON.stringify(config, null, '\t'), function (err) {
        if (err) {
            promise.reject(err);
        } else {
            promise.fulfill(true);
        }
    });

    return promise;
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

/**
 * Make sprite
 * @param {Image[]} images
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
 * @param {Image[]} images
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
 * @param {Image[]} images
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
 * @returns {VOW.Deferred} Sprite
 */
Spriter.prototype.write = function() {
    var sprite = this,
        promise = VOW.promise(),
        images = sprite._images,
        commands;

    if (images && images.length) {

        // define blank canvas
        commands = [
            "-define", "png:exclude-chunks=date",
            "-size", sprite._width + "x" + sprite._height, "xc:none"
        ];

        // define images
        images.forEach(function(image) {
            commands.push(
                image.path,
                "-geometry",
                    "+" + (parseInt(image.positionX, 10) + image.padding[3]) +
                    "+" + (parseInt(image.positionY, 10) + image.padding[2]),
                "-composite"
            );
        });

        // define output path
        commands.push(sprite.url);
        Spriter._makePath(sprite.url);

        // convert and write
        IM.convert(commands, function(err) {
            err ?
                promise.reject(err) :
                promise.fulfill(true);
        });

    } else {
        promise.reject();
    }

    return promise
        .fail(function(err) {
            console.log(err.toString());
        })
        .always(function() {
            return sprite;
        });
};

Object.defineProperties(
    Spriter.prototype, {
        url : {
            get : function() {
                return PATH.resolve(this.out, this.name + '.' + this.ext);
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
