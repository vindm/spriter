var VOW = require('vow'),
    FREEZE = require('borschik').freeze,
    FS = require('fs'),
    PATH = require('path'),
    EXTEND = require('extend'),
    Sprite = require('./lib/sprite'),
    Mapper = require('./lib/mapper');

/**
 * @constructor
 */
var Spriter = function(path) {
    this.path = path || process.cwd();
    this._sprites = {};
};

/**
 * @static
 * @type {RegExp}
 */
Spriter.spritableImgExtsRe = new RegExp('\\.(jpg|jpeg|gif|ico|png)$');

/**
 * @static
 * @param img Image data to check
 * @returns {boolean}
 */
Spriter.isImageSpritable = function(img) {
    var isImageSpritable,
        url = img.url,
        position = img.position,
        repeat = img.repeat;

    url = url &&
        Spriter.spritableImgExtsRe.test(PATH.extname(url));

    position = position &&
        String(position.x).indexOf('px') !== -1 &&
        String(position.y).indexOf('px') !== -1;

    repeat = ! repeat ||
        repeat === 'no-repeat';

    isImageSpritable = url && position && repeat;

    return isImageSpritable;
};

/**
 * @static
 * @type {Object}
 */
Spriter.defaultSpriteConfig = {
    name : 'common',
    path : 'sprited',
    ext : 'png',
    layout : 'smart',
    padding : 2,
    ifexist : 'overwrite'
};

/**
 * Get sprite by name
 * @private
 * @param {String} spriteName Name of sprite to return
 * @returns {Sprite|null}
 */
Spriter.prototype._getSprite = function(path) {
    var sprite;

    if (FS.existsSync(path)) {
        try {
            sprite = JSON.parse(FS.readFileSync(path));
        } catch (e) {
            if (e instanceof SyntaxError) {
                console.error('Sprite config not found: ' + path);
            }
            throw e;
        }
    }

    return sprite;
};

/**
 * @private
 * @param {Object} config
 * @returns {Sprite}
 */
Spriter.prototype._createSprite = function(config) {
    var mapper,
        exSpriteConfig,
        sprite,
        isRestored;

    config.path = config.path ?
        PATH.resolve(this.path, config.path) :
        PATH.resolve(this.path);


    if (! (config && config.ifexist && config.ifexist === 'overwrite')) {
        if (FS.existsSync(config.path)) {
            try {
                exSpriteConfig = JSON.parse(FS.readFileSync(PATH.join(config.path, config.name + '.json')));
            } catch (e) {
                if (e instanceof SyntaxError) {
                    console.error('Sprite config not found: ' + PATH.join(config.path, config.name + '.json'));
                }
            }
        }

        if (exSpriteConfig) {
            if (
                exSpriteConfig.ext === config.ext &&
                exSpriteConfig.mapper.layout === config.layout
            ) {
                mapper = Mapper.restore(exSpriteConfig);
                isRestored = true;
            }
        }
    }

    mapper = mapper || new Mapper({ layout : config.layout });
    sprite = new Sprite(config, mapper);
    sprite.isRestored = isRestored;

    this._sprites[config.name] = sprite;

    return sprite;
};

Spriter.prototype.restoreSprite = function(json) {
    var mapper = Mapper.restore(json),
        sprite = 'l';
};

/**
 * @param {Array} imagesData images
 * @returns {Object} images grouped by sprites
 */
Spriter.prototype.prepareSpritesData = function(imagesData) {
    var spritesData;

    spritesData = imagesData.reduce(function(spritesData, imageData) {
        var spriteName = imageData.spriteName,
            spriteConfig;

        spriteName && typeof spriteName === 'string' ||
            (spriteName = 'default');

        spriteConfig = Spriter.getSpritesConfig(
            imageData.outputFile || imageData.cssFilePath || imageData.url,
            spriteName
        );

        // could be overridden
        spriteName = spriteConfig.name;

        if ( ! spritesData[spriteName]) {
            spritesData[spriteName] = {
                config : spriteConfig,
                images : []
            };
        }

        imageData.id || (imageData.id = (Math.random() + '').substring(2, 10));

        spritesData[spriteName].images.push(imageData);

        return spritesData;
    }, {});

    return spritesData;
};

/**
 * @param {Array} imagesData Images to sprite
 * @returns {Q.promise} Array of successful processed sprites
 */
Spriter.prototype.make = function(imagesData) {
    var spriter = this,
        spritesData,
        spriteProcesses;

    spritesData = spriter.prepareSpritesData(imagesData);

    spriteProcesses = Object.keys(spritesData).reduce(function(spriteProcesses, spriteName) {
        var data = spritesData[spriteName],
            spriteProcess,
            sprite,
            ifexist;

        sprite = spriter._createSprite(data.config);
        ifexist = data.config.ifexist;

        if (sprite.isRestored) {
            if (ifexist === 'add' || ifexist.method === 'add') {
                spriteProcess = sprite.add(data.images);

            } else if (ifexist === 'use' || ifexist.method === 'use') {
                var notFoundImages = data.images,
                    newCnfg;

                sprite.images.forEach(function(spriteImg) {
                    notFoundImages.some(function(image, i) {
                        if (spriteImg.path === image.url) {
                            spriteImg.ids.push(image.id);
                            data.images.splice(i, 1);

                            return true;
                        }
                    });
                });

                spriteProcesses.push(VOW.promise(sprite));

                if (data.images.length) {
                    newCnfg = EXTEND(true,
                        {},
                        data.config,
                        ifexist['new'] ?
                            ifexist['new'] :
                            {
                                name : data.config.name += '_' + PATH.basename(data.images[0].cssFilePath, '.css')
                            }
                    );

                    spriteProcess = (spriter._createSprite(newCnfg)).make(data.images);
                }
            }
        }

        if ( ! spriteProcess) {
            spriteProcess = sprite.make(data.images);
        }

        spriteProcesses.push(spriteProcess);

        return spriteProcesses;
    }, []);

    return VOW
        .allResolved(spriteProcesses)
        .then(function(sprites) {
            return sprites.reduce(function(fulfilled, sprite) {

                var data = sprite.valueOf();

                if (sprite.isFulfilled && sprite.isFulfilled()) {
                    fulfilled.push(data);
                } else {
                    console.log('ERROR! Fail to make sprite ' + data);
                }

                return fulfilled;
            }, []);
        });
};

/**
 * Recursively sprite all images in path.
 * @param {String} input Directory path
 * @returns {Object} Sprites result data hash
 */
Spriter.spriteAll = function(input) {
    var foundImages = [],
        basePath = PATH.dirname(input),
        stat = FS.statSync(input);

    if (stat.isFile()) {
        throw new Error("Is a file (directory needed): " + input);
    } else if (stat.isDirectory()) {
        spriteAllProcessDir(input, basePath, foundImages);
    }

    return (new Spriter()).make(foundImages);
};

/**
 * Get sprite(s) config for specific file path.
 * @static
 * @param {String} filePath File path to use.
 * @param {String} spriteName Name of sprite to return config for.
 * @returns {Object} Hash with sprites configs
 *                  or config if spriteName is defined
 */
Spriter.getSpritesConfig = (function() {
    var cache = {};

    return function(filePath, spriteName) {
        var spritesCfgs,
            originPath = filePath;

        spritesCfgs = cache[originPath];

        if ( ! spritesCfgs) {
            filePath = PATH.normalize(PATH.resolve(filePath)).toString();

            if (filePath !== FREEZE.realpathSync(filePath)) throw Error();

            var prefix = '',
                defaultConfig,
                path = filePath,
                sep = PATH.sep == '\\' ? '\\\\' : PATH.sep,
                rePrefix = new RegExp('^(' + sep + '*[^' + sep +']+)', 'g'),
                matched;

            while (matched = path.match(rePrefix)) {
                prefix += matched[0];
                path = path.replace(rePrefix, '');

                var oldSpriterConfig = spritesCfgs && spritesCfgs.spriter;
                spritesCfgs = loadConfig(prefix);
                if (spritesCfgs) {
                    spritesCfgs.spriter = EXTEND(true,
                        oldSpriterConfig || {},
                        spritesCfgs.spriter || {}
                    );
                }
            }

            var spriterConfig = spritesCfgs && spritesCfgs.spriter;

            if (spriterConfig) {
                var scope = Object.keys(spriterConfig).reduce(function(prevScope, scope) {
                    if (
                        scope === filePath ||
                        PATH.relative(scope, filePath).indexOf('..') !== 0
                    ) {
                        prevScope = {
                            path : scope,
                            cnfg : EXTEND(true,
                                {},
                                prevScope && prevScope.cnfg || {},
                                spriterConfig[scope]
                            )
                        };
                    }

                    return prevScope;
                }, null);

                spritesCfgs = scope && scope.cnfg;

                defaultConfig = EXTEND(true,
                    {},
                    Spriter.defaultSpriteConfig,
                    spritesCfgs && spritesCfgs['default'] || {});

                spritesCfgs = spritesCfgs ?
                    Object.keys(spritesCfgs).reduce(function(config, sName) {
                        spritesCfgs[sName].name || (spritesCfgs[sName].name = sName);
                        config[sName] = EXTEND(true,
                            {},
                            defaultConfig,
                            spritesCfgs[sName] || {});

                        return config;
                    }, {}) :
                { default : defaultConfig };
            }

            cache[originPath] = spritesCfgs;
        }

        return typeof spriteName === 'string' ?
            spritesCfgs[spriteName] ||
                EXTEND(true,
                    {},
                    spritesCfgs['default'],
                    { name : spriteName }
                ) :
            spritesCfgs;
    };
})();

/**
 * Read dir recursively and process files
 * @param dir
 * @param basePath
 * @param {Object} result Result JSON
 */
function spriteAllProcessDir(dir, basePath, result) {
    FS.readdirSync(dir).forEach(function(file) {
        file = PATH.resolve(dir, file);

        var stat = FS.statSync(file);

        if (stat.isFile()) {
            spriteAllProcessFile(file, basePath, result);

        } else if (stat.isDirectory()) {
            spriteAllProcessDir(file, basePath, result);
        }
    });
}

/**
 * Process file
 * @param absPath
 * @param basePath
 * @param {Array} foundImages
 */
function spriteAllProcessFile(absPath, basePath, foundImages) {
    if (Spriter.spritableImgExtsRe.test(absPath)) {
        foundImages.push({
            url : absPath
        });
    }
}

/**
 * Load config from path.
 * @param {String} path - Path to load from.
 */
function loadConfig(path) {
    var config = loadConfig.cache[path];

    if ( ! config) {
        var config_path = PATH.resolve(path, '.borschik');

        if (FS.existsSync(config_path)) {
            try {
                config = JSON.parse(FS.readFileSync(config_path));
            } catch (e) {
                if (e instanceof SyntaxError) {
                    console.error('Invalid config: ' + config_path);
                }
                throw e;
            }
        }

        if (config) {

            // Resolve paths
            config.sprites && Object.keys(config.sprites)
                .map(function(spriteCnfg) {
                    var cnfgPath = config.sprites[spriteCnfg].path;

                    if (cnfgPath) {
                        config.sprites[spriteCnfg].path = FREEZE
                            .realpathSync(PATH.resolve(path, cnfgPath));
                    }
                });

            var spriterConfig = config.spriter;
            spriterConfig && Object.keys(spriterConfig)
                .forEach(function(mPath) {
                    var cnfg = spriterConfig[mPath],
                        mainPath = FREEZE
                            .realpathSync(PATH.resolve(path, mPath));

                    Object.keys(cnfg)
                        .forEach(function(spriteCnfg) {
                            var cnfgPath = cnfg[spriteCnfg].path;

                            if (cnfgPath) {
                                cnfg[spriteCnfg].path = FREEZE
                                    .realpathSync(PATH.resolve(path, cnfgPath));
                            }
                        });

                    config.spriter[mainPath] = cnfg;
                    delete config.spriter[mPath];
                });
        }


        loadConfig.cache[path] = config || {};
    }

    return config || {};
}
loadConfig.cache = {};

module.exports = Spriter;
