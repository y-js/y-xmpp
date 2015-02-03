gulp = require 'gulp'
coffee = require 'gulp-coffee'
uglify = require 'gulp-uglify'
plumber = require 'gulp-plumber'
browserify = require 'gulp-browserify'
rename = require 'gulp-rename'
ignore = require 'gulp-ignore'
coffeelint = require 'gulp-coffeelint'

paths =
  xmpp:   ['./lib/**/*.coffee']

buildConnector = (connector_name)->
  ()->
    gulp.src(paths[connector_name])
      .pipe plumber()
      .pipe coffeelint()
      .pipe coffeelint.reporter()

    gulp.src(paths[connector_name], {read: false})
      .pipe(plumber())
      .pipe browserify
        transform: ['coffeeify']
        extensions: ['.coffee']
        debug: true
        ignore: ['faye-websocket', './srv', 'dns', 'tls']
      .pipe rename
        extname: ".js"
      .pipe gulp.dest('./build/browser/')
      .pipe uglify()
      .pipe gulp.dest('./')

    gulp.src './*.html'
      .pipe gulp.dest './build/browser/'

gulp.task 'build_node', ->
  gulp.src(['./lib/**'])
    .pipe plumber()
    .pipe ignore.exclude '**/*polymer.coffee'
    .pipe coffee({bare:true})
    .pipe gulp.dest './build/node/'


gulp.task 'xmpp', [], buildConnector 'xmpp'

gulp.task 'build_browser', ['xmpp']
gulp.task 'build', ['build_browser', 'build_node']

# Rerun the task when a file changes
gulp.task 'watch', ()->
  gulp.watch(paths.xmpp, ['xmpp'])

gulp.task('default', ['watch', 'build'])









