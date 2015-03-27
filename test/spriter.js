var ASSERT = require('chai').assert,
    PATH = require('path'),
    FS = require('fs'),
    GLOBULE = require('globule'),
    SPRITER = require('..');

describe('Spriter', function() {

    var Test = function(name, ext) {
        this.action = name;
        this.basePath = PATH.resolve(__dirname, name);
        this.ext = ext || 'png';
        this.imagesPath = PATH.resolve(this.basePath, ext === 'svg' ? 'svg/' : 'images/');
    };

    Test.preparePaths = function(config, ext) {
        ext = config.ext || ext || '.png';

        var out = config.out,
            expect = config.expect || out;

        if (expect.indexOf('.') === -1) {
            if (expect.indexOf('-') === -1) {
                expect += '-expect';
            }
            if (ext === '.json') {
                expect += '-' + (config.ext || 'png');
            }
            expect += ext;
        }

        if (out.indexOf('.') === -1) {
            if (out.indexOf('-') === -1) {
                out += '-out';
            }
            if (ext === '.json') {
                out += '-' + (config.ext || 'png');
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
        if (arguments.length === 2 && typeof last === 'function') {
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
                require('child_process').exec('rm ' + _this.basePath + '/*-out*.*', function() {
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
            dir = config.dir,
            out = config.out || dir;

        out.indexOf('-') === -1 && (out += '-out');

        return SPRITER
            .api({
                src : config.src || (PATH.resolve(_this.imagesPath, dir) + '/**/*'),
                path : _this.basePath,
                name : out,
                ext : config.ext || _this.ext,
                ifexists : config.action || _this.action,
                layout : config.layout,
                padding : 2
            })
            .spread(function(images, sprites) {
                cb(null, images, sprites);
            })
            .fail(function(err) {
                cb(err);
            });
    };

    Test.prototype.compare = function(config, cb) {
        var test = this,
            callback1,
            callback2;

        try {
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
        } catch(e) {
            return cb(e);
        }

        return (callback2 || callback1 || cb)();
    };

    Test.prototype._compareConfigs = function(configs, cb) {
        Array.isArray(configs) || (configs = [ configs ]);

        try {
            configs.forEach(function(config) {
                var cnfg = Test.preparePaths(config, '.json');

                ASSERT.equal(
                    FS.readFileSync(PATH.resolve(this.basePath, cnfg.out), 'utf-8'),
                    FS.readFileSync(PATH.resolve(this.basePath, cnfg.expect), 'utf-8'));
            }, this);
        } catch(e) {
            return cb(e);
        }

        return cb && cb();
    };

    Test.prototype._compareImages = function(images, cb) {
        Array.isArray(images) || (images = [ images ]);

        try {
            images.forEach(function(image) {
                var img = Test.preparePaths(image, '.' + (image.ext || 'png'));

                ASSERT.equal(
                    FS.readFileSync(PATH.resolve(this.basePath, img.out), 'base64'),
                    FS.readFileSync(PATH.resolve(this.basePath, img.expect), 'base64'));
            }, this);
        } catch(e) {
            return cb(e);
        }

        return cb && cb();
    };

    Test.makePath = function(path) {
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

    describe('.create()', function() {
        var test = new Test('create').setup(this);

        [
            'horizontal', 'vertical',
            'smart'
        ]
            .forEach(function(layout) {

                it('should create new ' + layout + ' sprite', function(cb) {
                    test.act({ dir : 'base_' + layout, layout : layout }, function() {
                        test.compare({ out : 'base_' + layout }, cb);
                    });
                });

                it('should override existing ' + layout + ' sprite', function(cb) {
                    test.act({ dir : 'base_' + layout, out : 'override_' + layout, layout : layout }, function() {
                        test.act({ dir : 'override', out : 'override_' + layout,  layout : layout }, function() {
                            test.compare({ out : 'override_' + layout }, cb);
                        });
                    });
                });

                it('should not override identical existing ' + layout + ' sprite,' +
                    ' even if input images are renamed and replaced', function(cb) {
                    var images = GLOBULE.find([ PATH.resolve(test.imagesPath, 'base_' + layout) + '/**/*' ]);

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

                                        Test.makePath(newUrl);

                                        return 'cp ' + image.url + ' ' + newUrl;
                                    })
                            )
                            .join(' && ');

                    require('child_process').exec(cmd, function() {
                        test.act({ dir : 'base_' + layout, out : 'not_override_' + layout, layout : layout }, function() {
                            test.act({ dir : 'base_' + layout, layout : layout }, function() {
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

    describe('.create() svg', function() {
        var test = new Test('create', 'svg').setup(this);

        [
            'horizontal', 'vertical',
            'smart'
        ]
            .forEach(function(layout) {

                it('should create new ' + layout + ' svg sprite', function(cb) {
                    test.act({ dir : 'base_' + layout, layout : layout, ext : '.svg' }, function() {
                        test.compare({
                            out : 'base_' + layout,
                            ext : '.svg'
                        }, cb);
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

                it('should create new ' + layout + ' sprite', function(cb) {
                    test.act({ dir : 'base', out : 'base_' + layout, layout : layout }, function(err) {
                        err ? cb(err) : test.compare({ out : 'base_' + layout }, cb);
                    });
                });

                it('should restore existing ' + layout + ' sprite and extend it with extra images', function(cb) {
                    test.act({ dir : 'base', out : 'extra_' + layout, layout : layout }, function(err) {
                        err ? cb(err) : test.act({ dir : 'extra',  out : 'extra_' + layout, layout : layout }, function(err) {
                            err ? cb(err) : test.compare({ out : 'extra_' + layout }, cb);
                        });
                    });
                });

                it('should restore existing ' + layout + ' sprite and extend it with extra images, ' +
                    'without modifying current images positions, ' +
                    'for 5 times with randomly generated images set', function(cb) {

                    var images = GLOBULE.find([ PATH.resolve(test.imagesPath, 'safe') + '/**/*' ]);
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
                            dir : 'base_extra_safe_' + layout,
                            out : 'extra_safe_' + layout,
                            src : base
                        }, function() {
                            test.act({
                                dir : 'extra_safe_' + layout,
                                src : extra
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
                    var images = GLOBULE.find([ PATH.resolve(test.imagesPath, 'base') + '/**/*' ]);

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

                                        Test.makePath(newUrl);

                                        return 'cp ' + image.url + ' ' + newUrl;
                                    })
                            )
                            .join(' && ');

                    require('child_process').exec(cmd, function() {
                        test.act({ dir : 'base', out : 'not_override_' + layout, layout : layout }, function() {
                            test.act({ dir : 'not_override_' + layout, layout : layout }, function() {
                                cb();
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

                it('should create new ' + layout + ' sprite', function(cb) {
                    test.act({ dir : 'base', out : 'base_' + layout, layout : layout }, function() {
                        test.compare({ out : 'base_' + layout }, cb);
                    });
                });

                it('should not override identical existing ' + layout + ' sprite,' +
                    ' even if input images are renamed and replaced', function(cb) {
                    var images = GLOBULE.find([ PATH.resolve(test.imagesPath, 'base') + '/**/*' ]);

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

                                        Test.makePath(newUrl);

	                                    return 'cp ' + image.url + ' ' + newUrl;
	                                })
	                        )
                            .join(' && ');

                    require('child_process').exec(cmd, function() {
                        test.act({ dir : 'base', out : 'not_override_' + layout, layout : layout }, function() {
                            test.act({ dir : 'not_override_' + layout, layout : layout }, function() {
                                test.compare({ out : 'not_override_' + layout, expect : 'base_' + layout }, cb);
                            });
                        });
                    });

                    after(function(cb) {
                        require('child_process').exec('rm -rf ' + path, cb);
                    });
                });

                it('should create new ' + layout + ' sprite from images not containing in existent sprite',
	                function(cb) {
                    test.act({ dir : 'base', out : 'extra_' + layout, layout : layout }, function(err) {
                        if (err) {
                            return cb(err);
                        }

                        test.act({ dir : 'extra', out : 'extra_' + layout, layout : layout }, function(err) {
                            if (err) {
                                return cb(err);
                            }

                            cb();
                        });
                    });
                });

            });

    });

});
