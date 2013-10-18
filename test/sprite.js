var should = require('should');

describe('SPRITER', function() {
    var SPRITER = require('..'),
        PATH = require('path'),
        FS = require('fs');

    var CP = require('child_process');

    var BORSCHIK = require('../../.');

    const testDir = PATH.resolve('./test/sprite/dir');

    describe('#isImageSpritable', function() {

        it('should return true when image properties are suitable', function() {
            should.ok(
                SPRITER.isImageSpritable({
                    url : 'images/logo.png',
                    position : { x : '0px', y : '0px' }
                })
            );
            should.ok(
                SPRITER.isImageSpritable({
                    url : 'images/logo.jpeg',
                    position : { x : '0px', y : '0px' }
                })
            );

            should.ok(
                ! SPRITER.isImageSpritable({
                    url : 'images/logo.png',
                    position : { x : '0', y : '0' }
                })
            );
            should.ok(
                ! SPRITER.isImageSpritable({
                    url : 'images/logo.png',
                    position : { x : '10%', y : '0px' }
                })
            );
        });

    });

    describe('#getSpritesConfig', function() {
        var mainCnfgPath = PATH.resolve(testDir, 'main.css'),
            subCnfgPath = PATH.resolve(testDir, 'subdir/sub.css'),
            mainCnfg,
            subCnfg;

        it('should load sprites configs from .borschik', function() {
            mainCnfg = SPRITER.getSpritesConfig(mainCnfgPath);
            mainCnfg.should.have.property('default');
            mainCnfg.should.have.property('test');

            subCnfg = SPRITER.getSpritesConfig(subCnfgPath);
            subCnfg.should.have.property('default');
            subCnfg.should.have.property('test');
        });
//
//        it('should load sprites configs from cache', function() {
//            mainCnfg
//                .should.eql(SPRITER.getSpritesConfig.cache[mainCnfgPath]);
//
//            subCnfg
//                .should.eql(SPRITER.getSpritesConfig.cache[subCnfgPath]);
//        });

        it('should extend sprites configs', function() {
            // Defined sprite
            mainCnfg.test
                .should.have.property('name', 'main_test');

            subCnfg.test
                .should.have.property('name', 'sub_test');

            // Undefined sprite
            SPRITER.getSpritesConfig(mainCnfgPath, 'lol')
                .should.have.property('layout', 'horizontal');

            SPRITER.getSpritesConfig(subCnfgPath, 'lol')
                .should.have.property('layout', 'smart');
        });

        it('should load right resolved paths', function() {
            mainCnfg.test
                .should.have.property('path', PATH.resolve(
                    testDir, '../sprited/test'));

            subCnfg.test
                .should.have.property('path', PATH.resolve(
                    testDir, '../sprited/test'));
        });

    });

    describe('#spriteAll', function() {

//        afterEach(function(cb) {
//            CP.exec('rm -rf ' + PATH.resolve(testDir, '../sprited'), function() {
//                cb();
//            });
//        });

//        it('should sprite all images in dir and subdirs', function(cb) {
//            this.timeout(15000);
//
//            SPRITER
//                .spriteAll(testDir)
//                .then(function(result) {
//                    result.should.have.length(1);
//
//                    var sprites = result.reduce(function(sprites, sprite) {
//                            sprites[sprite.name] = sprite;
//                            return sprites;
//                        }, {});
//
//                    sprites.should.have.property('main');
//                    sprites.should.have.property('sub');
//
//                    var main = sprites.main,
//                        sub = sprites.sub;
//
//
//                    main.should.have.property('images').with.lengthOf(4);
//                    sub.should.have.property('images').with.lengthOf(9);
//
//                    [ main, sub ].forEach(function(sprite) {
//                        sprite.should.have.property('path', PATH.resolve(testDir, '../sprited'));
//
//                        should.ok(
//                            PATH.existsSync(PATH.resolve(sprite.path, sprite.name + '.' + sprite.ext))
//                        );
//                    });
//
//                    cb();
//                })
//                .fail(function(err) {
//                    cb(err.message);
//                });
//        });

    });
});
