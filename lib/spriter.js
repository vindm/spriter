var _ = require('lodash-node'),
    FS = require('fs'),
    VOW = require('vow'),
    PATH = require('path'),
    UTIL = require('util'),
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
    this.config = config;
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
    cache_path : './.spriter.json',
    relative : false,
    scale : false
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
Spriter._spritableImgExtsRe = /\.(jpg|jpeg|gif|ico|png|svg)$/;

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
            var svgImages = [],
                isNeedToProcessSvg = false,
                imgImages = preparedImages.filter(function(img) {
                    if (img.svg) {
                        svgImages.push(img);
                        isNeedToProcessSvg = true;

                        return false;
                    }

                    return true;
                }),
                defers = [];

            if (imgImages.length !== 0) {
                defers.push(Spriter._make(config, imgImages));
            }
            if (isNeedToProcessSvg) {
                defers.push(Spriter._make(EXTEND({}, config, { ext : 'svg' }), svgImages));
            }

            return VOW.all(defers);
        })
        .then(function(sprites) {
            return VOW.all(_.flatten(sprites).map(function(sprite) {
                return sprite.write();
            }));
        })
        .then(function(sprites) {
            // Map input and sprited images
            images.map(function(image) {
                var id = image.id;

                sprites.some(function(sprite) {
                    var processedImages = sprite._images;

                    return processedImages.some(function(processedImage) {
                        if (processedImage.ids.indexOf(id) !== - 1) {
                            image.sprite = sprite;
                            image.spriteUrl = sprite.url;
                            image.positionX = processedImage.positionX;
                            image.positionY = processedImage.positionY;
                            image.padding = processedImage.padding;
                            image.height = processedImage.height;
                            image.width = processedImage.width;
                            image.swidth = processedImage.swidth;
                            image.sheight = processedImage.sheight;
                            image.sum = processedImage.sum;
                            image.num = processedImage.num;
                            image.sx = processedImage.sx;
                            image.sy = processedImage.sy;

                            return true;
                        }

                        return false;
                    });
                });

                return image;
            });

            return [ images, sprites ];
        });
};

/**
 * @static
 * @private
 * @param {String|String[]} src Globbing pattern(s)
 * @returns {Object[]} Found images
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
 * @param {String|Object} image
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
 * @param {Object[]} images
 * @param {Object} config
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

/**
 * @private
 * @param {Object} imageData
 * @returns {Object}
 */
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
            Spriter
                ._identifyImage(image)
                .then(function(imgDims) {
                    dims = cache[image.sum] = imgDims;
                    deferred.resolve(dims);
                })
                .fail(function(e) {
                    deferred.reject(e);
                });
        } else {
            deferred.resolve(dims);
        }
    });

    return deferred.promise()
        .then(function(dims) {
            cache[image.sum] = dims;

            image.width = dims.width;
            image.height = dims.height;
            image.totalWidth = image.padding[3] + image.width + image.padding[1];
            image.totalHeight = image.padding[0] + image.height + image.padding[2];
            image.svg = dims.svg;

            return image;
        });
};

Spriter._identifyImage = function(image) {
    var deferred = VOW.defer(),
        cb = function(err, dims) {//console.log(dims);
            err ?
                deferred.reject(err) :
                deferred.resolve(dims);
        };

    if (/\.svg$/.test(image.url)) {
        Spriter._identifySvg(image, cb);
    } else {
        Spriter._identifyImg(image, cb);
    }

    return deferred.promise();
};

Spriter._identifySvg = function(image, cb) {
    var xml = FS.readFileSync(image.url, 'utf-8');

    var htmlparser2 = require('htmlparser2'),
        dom = htmlparser2.parseDOM(xml, { xmlMode : true }),
        svg,
        attrs,
        viewbox,
        width,
        height;

    dom.some(function(tag) {
        if (tag.type === 'tag' && tag.name === 'svg') {
            svg = tag;
        }
    });

    if ( ! svg) {
        return cb(new Error('Bad svg file'));
    }

    attrs = svg.attribs;
    viewbox = attrs.viewBox;
    width = null;
    height = null;

    if (viewbox) {
        viewbox	= viewbox.split(/[^\d\.]+/);
        while (viewbox.length < 4) {
            viewbox.push(0);
        }
        viewbox.forEach(function(value, index) {
            viewbox[index] = parseInt(value, 10);
        });
        width = viewbox[2];
        height = viewbox[3];
    } else {
        width = attrs.width;
        height = attrs.height;
    }

    if (width === null || height === null) {
        cb(new Error('Svg image size is not defined'));
    }

    cb(null, {
        width : parseFloat(width),
        height : parseFloat(height),
        svg : (function prepare(tag) {
            return tag.type === 'tag' && {
                tag : tag.name,
                $ : tag.attribs,
                children : tag.children && tag.children.reduce(function(children, child) {
                    (child = prepare(child)) && children.push(child);

                    return children;
                }, [])
            };
        })(svg)
    });
};

Spriter._identifyImg = function(image, cb) {
    IM.identify(image.url, cb);
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

    existSprite = spriter._restoreSprite(config);

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
                            image.ids.forEach(function(id) {
                                if (spritedImage.ids.indexOf(id) === -1) {
                                    spritedImage.ids.push(image.id);
                                }
                            });
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
            (existSprite.mapper.layout !== config.layout || existSprite.mapper.padding.join() !== config.padding.join())
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
    var parsedConfig = Spriter._parseSpriteConfig(PATH.join(config.path, config.name + '-' + config.ext + '.json')),
        parsedSprite = parsedConfig && parsedConfig.sprite,
        sprite,
        mapper;

    if (parsedSprite && (mapper = new Mapper(parsedSprite.mapper)) ) {
        sprite = new Spriter(parsedSprite, mapper);
        sprite.parsedConfig = parsedConfig;
    } else {
        sprite = Spriter._createSprite(config);
    }

    return sprite;
};

/**
 * Find and parse sprite config
 * @static
 * @private
 * @param {String} configPath
 * @returns {?Object}
 */
Spriter._parseSpriteConfig = function(configPath) {
    var exSpriteConfig = null,
        spritePath;

    if (FS.existsSync(configPath)) {
        try {
            exSpriteConfig = JSON.parse(FS.readFileSync(configPath));
            spritePath = PATH.resolve(exSpriteConfig.sprite.path,
                    exSpriteConfig.sprite.name + '.' + exSpriteConfig.sprite.ext);

            if ( ! FS.existsSync(spritePath)) {
                throw(new Error('Sprite not found: ' + spritePath));
            }
            if (exSpriteConfig.meta.version !== Spriter._configVersion) {
                throw(new Error('Deprecated config version: ' + configPath));
            }
        } catch (e) {
            e instanceof SyntaxError ?
                UTIL.error('Invalid sprite config.', e) :
                UTIL.error(e, 'Sprite will be rebuilded.');

            exSpriteConfig = null;
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

    return function(action, scope, addition) {
        var dt = new Date();

        UTIL.puts(
            colors.grey(
                zeros(dt.getHours(), 2) + ':' +
                zeros(dt.getMinutes(), 2) + ':' +
                zeros(dt.getSeconds(), 2) + '.' +
                zeros(dt.getMilliseconds(), 3) + ' - ' +
                '[' + colors.magenta('Spriter') + '] '+
                '[' + colors.cyan(action) + '] ' +
                colors.blue(scope) +
                (addition ? ' ' + addition : '')
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

Spriter.prototype._scale = function() {
    var scale = this.config.scale,
        isScaleWidth = scale && typeof scale.width === 'number',
        isScaleHeight = scale && typeof scale.height === 'number',
        spriteWidth = this._width,
        spriteHeight = this._height,
        sratio;

    if (isScaleWidth || isScaleHeight) {
        sratio = spriteWidth / spriteHeight;

        if (isScaleWidth) {
            spriteWidth = spriteWidth * scale.width;
            isScaleHeight || (spriteHeight = spriteWidth / sratio);
        }

        if (isScaleHeight) {
            spriteHeight = spriteHeight * scale.height;
            isScaleWidth || (spriteWidth = spriteHeight * sratio);
        }
    }

    this.swidth = parseFloat(spriteWidth);
    this.sheight = parseFloat(spriteHeight);

    this._images.forEach(function(image) {
        var ratio,
            w, h, x, y;

        if (isScaleWidth || isScaleHeight) {
            ratio = image.width / image.height;

            if (isScaleWidth) {
                w = scale.width * image.width;
                x = scale.width * image.positionX;

                if ( ! isScaleHeight) {
                    h = w / ratio;
                    y = h  * image.positionY / image.height;
                }
            }

            if (isScaleHeight) {
                y = scale.height * image.height;
                h = scale.height * image.positionY;

                if ( ! isScaleWidth) {
                    w = h * ratio;
                    x = w  / image.width * image.positionX;
                }
            }
        } else {
            w = image.width;
            h = image.height;
            x = image.positionX;
            y = image.positionY;
        }

        image.swidth = parseFloat(w);
        image.sheight = parseFloat(h);
        image.sx = parseFloat(x);
        image.sy = parseFloat(y);
    });
};

/**
 * Write sprite
 * @private
 * @param {Object[]} images
 * @returns {VOW.Deferred} Sprite
 */
Spriter.prototype.write = function() {
    var sprite = this,
        deferred = VOW.defer(),
        spritedImages = sprite._images,
        cnfgPath = sprite.configUrl,
        exist = sprite.parsedConfig,
        config = {},
        writeConfig,
        hashsum;

    sprite._scale();
    config.sprite = _.pick(sprite, function(value, key) {
        return key !== 'parsedConfig' && key !== 'config';
    });

    hashsum = CRYPTO.createHash('sha1');
    hashsum.update(JSON.stringify(config));
    hashsum = hashsum.digest('hex');

    if (exist && hashsum === exist.meta.hashsum) {
        deferred.resolve('IsValid');

    } else if (spritedImages && spritedImages.length) {
        writeConfig = function(err) {
            if (err) {
                return deferred.reject(err);
            }

            config.meta = {
                version : Spriter._configVersion,
                hashsum : hashsum
            };

            FS.writeFile(cnfgPath, JSON.stringify(config), function(err) {
                if (err) {
                    deferred.reject(err);
                } else {
                    deferred.resolve(exist ? 'Rebuild' : 'Build');
                }
            });
        };

        try {
            Spriter._makePath(sprite.url);
            sprite.ext === 'svg' ?
                sprite._writeSpriteSvg(writeConfig) :
                sprite._writeSpriteImg(writeConfig);
        } catch(err) {
            deferred.reject(err);
        }

    } else {
        deferred.reject('Empty sprite');
    }

    return deferred.promise()
        .then(function(state) {
            Spriter.log(colors.green(state), sprite.url);
        }, function(e) {
            Spriter.log(colors.red('Failed'), sprite.url, e);
        })
        .always(function() {
            return sprite;
        });
};

Spriter.prototype._writeSpriteImg = function(cb) {
    var sprite = this,
        spritedImages = sprite._images,
        commands;

    // define blank canvas
    commands = [
        '-define', 'png:exclude-chunks=date',
        '-size', sprite.swidth + 'x' + sprite.sheight, 'xc:none'
    ];

    // define images
    spritedImages.forEach(function(image) {
        commands.push(image.url,
            '-geometry',
                '+' + image.sx +
                '+' + image.sy,
            '-composite'
        );
    });

    // define output path
    commands.push(sprite.url);

    // convert and write
    IM.convert(commands, cb);
};

Spriter.prototype._writeSpriteSvg = function(cb) {
    var sprite = this,
        spritedImages = sprite._images,
        left = spritedImages.length,
        spriteSVG = {
            tag : 'svg',
            $ : {
                xmlns : 'http://www.w3.org/2000/svg',
                width : parseFloat(sprite.swidth.toFixed(3), 10),
                height : parseFloat(sprite.sheight.toFixed(3), 10),
                viewBox : [ 0, 0, sprite._width, sprite._height ].join(' ')
            },
            children : []
        };

    spritedImages.forEach(function(image) {
        var $ = _.pick(image.svg.$, function(value, key) {
            if (/^xml/.test(key)) {
                spriteSVG.$[key] = value;

                return false;
            }

            return [
                'version', 'baseProfile',
                'contentStyleType', 'contentScriptType',
                'preserveAspectRatio', 'viewBox', 'x', 'y'
            ].indexOf(key) === -1;
        });

        $.width = parseFloat(image.swidth.toFixed(3), 10);
        $.height = parseFloat(image.sheight.toFixed(3), 10);
        $.transform = 'translate(' + [ image.positionX, image.positionY ].join(', ') + ')';

        spriteSVG.children.push({
            tag : 'g',
            $ : $,
            children : image.svg.children
        });

        if (--left < 1) {
            try {
                FS.writeFile(sprite.url, (function toXml(elem, deep) {//console.log('ELEM', elem)
                    return '<' + elem.tag +
                        (elem.$ ?
                            ' ' + Object.keys(elem.$).map(function(attr) {
                                return attr + '="' + elem.$[attr]+ '"';
                            }).join(' ') :
                            '') +
                        (elem.children ?
                            '>' +
                                (elem.children.length ?
                                    '\n' + new Array(deep).join('\t') +
                                    elem.children.map(function(child) {
                                        return toXml(child, deep + 1);
                                    }).join('\n' + new Array(deep).join('\t')) +
                                    '\n' + new Array(deep - 1).join('\t') :
                                '') +
                                '</' + elem.tag + '>' :
                            '/>');
                })(spriteSVG, 2), cb);
            } catch(e) {
                cb(e);
            }
        }
    });
};

Object.defineProperties(
    Spriter.prototype, {
        url : {
            get : function() {
                return PATH.relative('.', PATH.resolve(this.path, this.name + '.' + this.ext));
            }
        },
        configUrl : {
            get : function() {
                return PATH.join(this.path, this.name + '-' + this.ext + '.json');
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
