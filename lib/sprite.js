var VOW = require('vow'),
    FS = require('fs'),
    PATH = require('path'),
    IM = require('imagemagick'),
    Image = require('./image');

/**
 * @constructor
 */
var Sprite = function(config, mapper) {
    this.name = config.name;
    this.path = config.path;
    this.ext = config.ext;
    this.mapper = mapper;

    this.images = config.images || mapper.images || mapper.canvas && mapper.canvas.images || [];
};

Sprite.prototype.prepareImages = function(images) {
    var _this = this,
        imagesByUrl,
        readingPromises = [],
        imagesByUrl = {};

    images.forEach(function(img) {
        if (imagesByUrl[img.url]) {
            imagesByUrl[img.url].ids.push(img.id);
            imagesByUrl[img.url].padding = imagesByUrl[img.url].padding
                .map(function(p, i) {
                    return p > img.padding[i] ? p : img.padding[i];
                }, 0);
        } else {
            imagesByUrl[img.url] = new Image(img);
            readingPromises.push(imagesByUrl[img.url].readDimensions());
        }
    });

    return VOW.all(readingPromises);
};

/**
 * Make sprite
 * @param {Array} images
 * @returns {Vow.promise} self
 */
Sprite.prototype.make = function(images) {
    var _this = this;

    images || (images = _this.images);

    return this
        .prepareImages(images)
        .then(function(imagesByUrl) {
            var imgs = imagesByUrl;

            _this.mappedData = _this.mapper.mapImages(imgs);
            _this.images = imgs;

            return _this._write();
        })
        .then(function() {
            return _this;
        });
};

Sprite.prototype.add = function(newImages) {
    var _this = this,
        mapper = this.mapper,
        fitter = mapper && mapper.fitter,
        canvas = fitter && fitter.canvas,
        oldImages = canvas && canvas.images,
        diffImages;

    diffImages = newImages.reduce(function(diffImages, image) {
        var exist;

        oldImages && oldImages.some(function(oldImage) {
            if (oldImage.path === image.url) {
                var isPaddingAllowed = ! oldImage.padding
                    .some(function(oldP, i) {
                        return oldP < image.padding[i];
                    });

                if (isPaddingAllowed) {
                    exist = oldImage;
                    return true;
                }
            }
        });

        exist ?
            exist.ids.push(image.id) :
            diffImages.push(image);

        return diffImages;
    }, []);

    return diffImages.length ?
        this
            .prepareImages(diffImages)
            .then(function(images) {
                fitter.allowed_diff = 0;

                images.forEach(function(image) {
                    var fitBlock = canvas.willFit(image);

                    if (fitBlock) {
                        fitBlock.add(image);
                    }
                });

                fitter.map();

                _this.mappedData = fitter;
                _this.images = _this.mappedData.images = fitter.canvas.images;
                _this.mapper.width = canvas.width;
                _this.mapper.height = canvas.height;

                return _this._write()
            })
            .then(function() {
                return _this;
            }) :
        VOW.promise(_this);
};

/**
 * Write images to sprite
 * @private
 * @returns {Q.promise} isSuccessful
 */
Sprite.prototype._write = function() {
    var sprite = this,
        images = this.images || [],
        commands = this._emptySprite,
        isSuccessful = VOW.promise();

    mkpath(sprite.url);

    images && images.forEach(function(img) {
        sprite._addImageData(commands, img);
    });

    commands.push(sprite.url);

    IM.convert(commands, function(err) {
        if (err) {
            console.log('convert failed', err);
            isSuccessful.reject(err);
        } else {
            var cnfgPath = PATH.join(sprite.path, sprite.name + '.json');

            mkpath(cnfgPath);
            FS.writeFile(cnfgPath, JSON.stringify(sprite, null, '\t'), function (err) {
                if (err) {
                    isSuccessful.reject(err);
                } else {
                    isSuccessful.fulfill(true);
                }
            });
        }
    });

    return isSuccessful;
};

/**
 * Add imageData to commands sequence
 * @private
 * @param {Array} commands
 * @param {Image} image
 */
Sprite.prototype._addImageData = function(commands, image) {

    commands.push(image.path, "-geometry",
        "+" + (parseInt(image.positionX, 10) + image.padding[3]) +
        "+" + (parseInt(image.positionY, 10) + image.padding[2]), "-composite");
};

Object.defineProperties(
    Sprite.prototype, {
        url : {
            get : function() {
                return PATH.resolve(this.path, this.name + '.' + this.ext);
            },
            enumerable : true
        },
        _width : {
            get : function() {
                return this.mapper.width;
            },
            enumerable : true
        },
        _height : {
            get : function() {
                return this.mapper.height;
            },
            enumerable : true
        },
        _emptySprite : {
            get : function() {
                return ["-size", this._width + "x" + this._height, "xc:none"];
            },
            enumerable : true
        }
    }
);

/**
 * Make dirs if not exists.
 * @param {String} path Path to make.
 */
function mkpath(path) {
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
}

module.exports = Sprite;
