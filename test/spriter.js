var ASSERT = require('chai').assert,
    PATH = require('path'),
    FS = require('fs'),
    SPRITER = require('..');

describe('Spriter', function() {

    var Test = function(name) {
        this.action = name;
        this.basePath = PATH.resolve(__dirname, name);
        this.imagesPath = PATH.resolve(this.basePath, 'images/');
    };

    Test.preparePaths = function(config, ext) {
        var out = config.out,
            expect = config.expect || out;

        if (expect.indexOf('.') === -1) {
            if (expect.indexOf('-') === -1) {
                expect += '-expect';
            }
            expect += ext;
        }

        if (out.indexOf('.') === -1) {
            if (out.indexOf('-') === -1) {
                out += '-out';
            }
            out += ext;
        }

        if (out === expect) {
            throw('');
        }

        return {
            out : out,
            expect : expect
        };
    };

    Test.prototype.copy = function(out, last, cb) {
        if (arguments.length === 2 && typeof last === "function") {
            cb = arguments[1];
            last = arguments[0];
        }

        var imgOutPath = PATH.resolve(this.basePath, out + '-out.png'),
            imgLastPath = PATH.resolve(this.basePath, last + '-last.png'),
            cmd = [];

        cmd.push('cp ' + imgOutPath + ' ' + imgLastPath);
        cmd.push('cp ' +
                PATH.resolve(this.basePath, out + '-out.json') + ' ' +
                PATH.resolve(this.basePath, last + '-last.json')
        );

        require('child_process').exec(cmd.join(' && '), function() {
            cb();
        });
    };

    Test.prototype.setup = function(test, config) {
        var _this = this;

        config || (config = {});

        config.before = [].concat(config.before || [], [
            function(cb) {
                require('child_process').exec('rm -f ' + _this.basePath + '/*-last.*', function() {
                    cb();
                });
            }
        ]);

        config.beforeEach = [].concat(config.beforeEach || []);

        config.afterEach = [].concat(config.afterEach || [], [
            function(cb) {
                require('child_process').exec('rm -f ' + _this.basePath + '/*-out.*', function() {
                    cb();
                });
            }
        ]);

        config.after = [].concat(config.after || []);

        config.before.length &&
            before.apply(test, config.before);

        config.beforeEach.length &&
            beforeEach.apply(test, config.beforeEach);

        config.afterEach.length &&
            afterEach.apply(test, config.afterEach);

        config.after.length &&
            after.apply(test, config.after);

        return _this;
    };

    Test.prototype.act = function(config, cb) {
        var _this = this,
            dir = config.input,
            out = config.output || dir;

        out.indexOf('-') === -1 && (out += '-out');

        var spriteConfig = {
                path : _this.basePath,
                name : out,
                ifexist : config.action || _this.action,
                layout : config.layout
            },
            foundImages = config.images ||
                SPRITER._findImages(PATH.resolve(_this.imagesPath, dir) + '/**/*');

        return SPRITER
            .make(spriteConfig, foundImages)
            .then(function(result) {
                cb(null, result);
            })
            .fail(function(err) {
                console.log(err.stack);
                cb(err);
            });
    };

    Test.prototype.compare = function(config, cb) {
        var test = this;

        try {
            test._beforeCompare(config, function() {
                test._compare(config, function() {
                    test._afterCompare(config, cb);
                });
            });
        } catch(e) {
            cb(e);
        }
    };

    Test.prototype._beforeCompare = function(config, cb) {
        return cb && cb();
    };

    Test.prototype._compare = function(config, cb) {
        var test = this,
            callback1,
            callback2;

        if ( ! config.isNotNeedToCompareImages) {
            callback1 = function() {
                test._compareImages(config, cb);
            };
        }

        if ( ! config.isNotNeedToCompareConfigs) {
            callback2 = function() {
                test._compareConfigs(config, callback1 || cb);
            };
        }

        return (callback2 || callback1 || cb)();
    };

    Test.prototype._afterCompare = function(config, cb) {
        return cb && cb();
    };

    Test.prototype._getConfig = function(name) {
        return require(PATH.resolve(this.basePath, name));
    };

    Test.prototype._compareConfigs = function(configs, cb) {
        Array.isArray(configs) || (configs = [ configs ]);

        configs.forEach(function(config) {
            var cnfg = Test.preparePaths(config, '.json'),
                cnfgOut = this._getConfig(cnfg.out),
                cnfgExpect = this._getConfig(cnfg.expect);

            this._compareConfigsImages({ out : cnfgOut.images, expect : cnfgExpect.images });
        }, this);

        return cb && cb();
    };

    Test.prototype._compareConfigsImages = function(images, cb) {
        var outImages = images.out;

        images.expect.forEach(function(imgExpect) {
            outImages.some(function(imgOut) {
                if (imgOut.sum === imgExpect.sum) {
                    ASSERT.equal(imgOut.positionX, imgExpect.positionX);
                    ASSERT.equal(imgOut.positionY, imgExpect.positionY);

                    return true;
                }
            });
        });

        return cb && cb();
    };

    Test.prototype._compareImages = function(images, cb) {
        Array.isArray(images) || (images = [ images ]);

        images.forEach(function(image) {
            var img = Test.preparePaths(image, '.png'),
                imgOut = FS.readFileSync(PATH.resolve(this.basePath, img.out), 'base64'),
                imgExpect = FS.readFileSync(PATH.resolve(this.basePath, img.expect), 'base64');

            ASSERT.equal(imgOut, imgExpect);
        }, this);

        return cb && cb();
    };

    describe('.create()', function() {
        var test = new Test('create').setup(this);

        [
            'horizontal', 'vertical', 'smart'
        ]
            .forEach(function(layout) {

                it('should create new ' + layout + ' sprite from images', function(cb) {
                    test.act({ input : 'base_' + layout, layout : layout }, function() {
                        test.compare({ out : 'base_' + layout }, cb);
                    });
                });

                it('should override existing ' + layout + ' sprite', function(cb) {
                    test.act({ input : 'base_' + layout, output : 'override_' + layout, layout : layout }, function() {
                        test.act({ layout : layout, input : 'override', output : 'override_' + layout }, function() {
                            test.compare({ out : 'override_' + layout }, cb);
                        });
                    });
                });

                it('should not override identical existing ' + layout + ' sprite,' +
                    ' even if input images are renamed and replaced', function(cb) {
                    var images = SPRITER._findImages([ PATH.resolve(test.imagesPath, 'base_' + layout) + '/**/*' ]);

                    var dir = 'not_override_' + layout,
                        path = PATH.resolve(test.imagesPath, dir),
                        cmd = []
                            .concat(
                                images
                                    .map(function(image) {
                                        var ext = PATH.extname(image.url),
                                            name = PATH.basename(image.url, ext),
                                            newUrl;

                                        name = String(Math.random()).substr(2, 7) + '_' + name;
                                        newUrl = PATH.resolve(path, name + ext);

                                        SPRITER._makePath(newUrl);

                                        return 'cp ' + image.url + ' ' + newUrl;
                                    })
                            )
                            .join(' && ');

                    require('child_process').exec(cmd, function() {
                        test.act({ input : 'base_' + layout, out : 'not_override_' + layout, layout : layout }, function() {
                            test.act({ input : 'not_override_' + layout, layout : layout }, function() {
                                test.compare({ out : 'not_override_' + layout, expect : 'base_' + layout }, cb);
                            });
                        });
                    });

                    after(function(cb) {
                        require('child_process').exec('rm -rf ' + path, cb);
                    });
                });

            });

    });

    describe('.add()', function() {
        var test = new Test('add').setup(this);

        [
            'horizontal', 'vertical', 'smart'
        ]
            .forEach(function(layout) {

                it('should create new ' + layout + ' sprite from images', function(cb) {
                    test.act({ input : 'base', output : 'base_' + layout, layout : layout }, function(err) {
                        err ? cb(err) : test.compare({ out : 'base_' + layout }, cb);
                    });
                });

                it('should restore existing ' + layout + ' sprite and extend it with extra images', function(cb) {
                    test.act({ input : 'base', output : 'extra_' + layout, layout : layout  }, function(err) {
                        err ? cb(err) : test.act({ input : 'extra',  output : 'extra_' + layout, layout : layout }, function(err) {
                            err ? cb(err) : test.compare({ out : 'extra_' + layout }, cb);
                        });
                    });
                });

                it('should restore existing ' + layout + ' sprite and extend it with extra images, ' +
                    'without modifying current images positions, ' +
                    'for 5 times with randomly generated images set', function(cb) {

                    var images = SPRITER._findImages([PATH.resolve(test.imagesPath, 'safe') + '/**/*']);
                    var base_images_path = PATH.resolve(test.imagesPath, 'base_extra_safe_' + layout);
                    var images_path = PATH.resolve(test.imagesPath, 'extra_safe_' + layout);

                    var testsCount = 5;

                    after(function(cb) {
                        require('child_process').exec('rm -rf ' + images_path + ' ' + base_images_path, function() {
                            cb();
                        });
                    });

                    function act(cb) {
                        var array = images,
                            base,
                            extra,
                            tmp,
                            current,
                            top = array.length;

                        if (top) {
                            while (--top) {
                                current = Math.floor(Math.random() * (top + 1));
                                tmp = array[current];
                                array[current] = array[top];
                                array[top] = tmp;
                            }
                        }

                        base = array.slice(0, 10);
                        extra = base.splice(0, 5);

                        test.act({
                            input : 'base_extra_safe_' + layout,
                            output : 'extra_safe_' + layout,
                            images : base
                        }, function() {
                            test.act({
                                input : 'extra_safe_' + layout,
                                images : extra
                            }, function() {
                                test.compare({
                                    out : 'extra_safe_' + layout,
                                    expect : 'base_extra_safe_' + layout + '-out',
                                    isNotNeedToCompareImages : true
                                }, function() { --testsCount > 0 ? act(cb) : cb(); });
                            });
                        });
                    }

                    act(cb);
                });

                it('should not override identical existing ' + layout + ' sprite,' +
                    ' even if input images are renamed and replaced', function(cb) {
                    var images = SPRITER._findImages([ PATH.resolve(test.imagesPath, 'base') + '/**/*' ]);

                    var dir = 'not_override_' + layout,
                        path = PATH.resolve(test.imagesPath, dir),
                        cmd = []
                            .concat(
                                images
                                    .map(function(image) {
                                        var ext = PATH.extname(image.url),
                                            name = PATH.basename(image.url, ext),
                                            newUrl;

                                        name = String(Math.random()).substr(2, 7) + '_' + name;
                                        newUrl = PATH.resolve(path, name + ext);

                                        SPRITER._makePath(newUrl);

                                        return 'cp ' + image.url + ' ' + newUrl;
                                    })
                            )
                            .join(' && ');

                    require('child_process').exec(cmd, function() {
                        test.act({ input : 'base', out : 'not_override_' + layout, layout : layout }, function() {
                            test.act({ input : 'not_override_' + layout, layout : layout }, function() {
                                test.compare({ out : 'not_override_' + layout, expect : 'base_' + layout }, cb);
                            });
                        });
                    });

                    after(function(cb) {
                        require('child_process').exec('rm -rf ' + path, cb);
                    });
                });

            });

    });

    describe('.use()', function() {
        var test = new Test('use').setup(this);

        [
            'horizontal', 'vertical', 'smart'
        ]
            .forEach(function(layout) {

                it('should create new ' + layout + ' sprite from images', function(cb) {
                    test.act({ input : 'base', output : 'base_' + layout, layout : layout }, function() {
                        test.compare({ out : 'base_' + layout }, cb);
                    });
                });

                it('should not override identical existing ' + layout + ' sprite,' +
                    ' even if input images are renamed and replaced', function(cb) {
                    var images = SPRITER._findImages([ PATH.resolve(test.imagesPath, 'base') + '/**/*' ]);

                    var dir = 'not_override_' + layout,
                        path = PATH.resolve(test.imagesPath, dir),
                        cmd = []
                            .concat(
                            images
                                .map(function(image) {
                                    var ext = PATH.extname(image.url),
                                        name = PATH.basename(image.url, ext),
                                        newUrl;

                                    name = String(Math.random()).substr(2, 7) + '_' + name;
                                    newUrl = PATH.resolve(path, name + ext);

                                    SPRITER._makePath(newUrl);

                                    return 'cp ' + image.url + ' ' + newUrl;
                                })
                        )
                            .join(' && ');

                    require('child_process').exec(cmd, function() {
                        test.act({ input : 'base', out : 'not_override_' + layout, layout : layout }, function() {
                            test.act({ input : 'not_override_' + layout, layout : layout }, function() {
                                test.compare({ out : 'not_override_' + layout, expect : 'base_' + layout }, cb);
                            });
                        });
                    });

                    after(function(cb) {
                        require('child_process').exec('rm -rf ' + path, cb);
                    });
                });

                it('should create new ' + layout + ' sprite from images not containing in existent sprite', function (cb) {
                    test.act({ input : 'base', output : 'extra_' + layout, layout : layout }, function (err) {
                        if (err) {
                            return cb(err);
                        }

                        test.act({ input : 'extra', output : 'extra_' + layout, layout : layout }, function(err, res) {
                            if (err) {
                                return cb(err);
                            }

                            test.copy('extended_extra_' + layout, function() {
                                try {
                                    var spriteImages = [].concat(
                                        test._getConfig('extra_' + layout + '-out.json').images || [],
                                        test._getConfig('extended_extra_' + layout + '-out.json').images || []
                                    );

                                    test
                                        ._compareConfigsImages({ out : spriteImages, expect : res }, cb);

                                } catch (err) {
                                    cb(err);
                                }
                            });
                        });
                    });
                });

            });

    });

});
