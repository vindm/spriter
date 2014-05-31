var CRYPTO = require('crypto'),
    VOW = require('vow'),
    FS = require('fs'),
    IM = require('imagemagick');

/**
 * @constructor
 * @param {Object} imageData
 */
var Image = function(imageData) {
    this.ids = [ imageData.id || String(Math.random()).substr(2, 10) ];
    this.url = imageData.url;
    this.path = imageData.url;

    this.positionX = imageData.position && imageData.position.x || 0;
    this.positionY = imageData.position && imageData.position.y || 0;
    this.padding = imageData.padding || [ 0, 0, 0, 0 ];
    this.width = imageData.width || 0;
    this.height = imageData.height || 0;
};

/**
 * Allowed image extensions
 * @const
 * @type {RegExp}
 */
Image.EXT_NAMES_RE = /\.(png|gif|jpg|jpeg)$/;

/**
 * @returns {Image}
 */
Image.prototype.readHashSum = function() {
    var image = this,
        numsLen,
        rx = /\d/g,
        num = '';

    image.sum = CRYPTO
        .createHash('sha1')
        .update(FS.readFileSync(image.path, 'base64'))
        .digest('hex');

    // get unique id by extracting first 3 numbers from hash
    for (numsLen = 3; numsLen >= 0; numsLen--) {
        num += String(rx.exec(image.sum)[0]);
    }

    image.num = parseInt(num, 10);

    return image;
};

/**
 * @returns {VOW.promise}
 */
Image.prototype.readDimensions = function() {
    var image = this,
        deferred = VOW.promise();

    IM.identify(image.path, function(err, img) {
        if (err) {
            return deferred.reject(err);
        }

        image.width = img.width;
        image.height = img.height;

        image.totalWidth = image.padding[3] + image.width + image.padding[1];
        image.totalHeight = image.padding[0] + image.height + image.padding[2];

        image.readHashSum();

        deferred.fulfill(image);
    });

    return deferred
        .fail(function(err) {
            console.log(err.toString());
        });
};

module.exports = Image;
