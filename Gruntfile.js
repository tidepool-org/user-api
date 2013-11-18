/*
== STANDARD HEADER ==

Gruntfile for dummy-api
*/

module.exports = function(grunt) {
  'use strict';

  // Project configuration.
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    uglify: {
      options: {
        banner: '/*! <%= pkg.name %> <%= grunt.template.today("yyyy-mm-dd") %> */\n'
      },
      build: {
        src: 'src/<%= pkg.name %>.js',
        dest: 'build/<%= pkg.name %>.min.js'
      }
    },
    jshint: {
      options: {
        jshintrc: '.jshintrc'
      },
      all: ['Gruntfile.js', 'lib/**/*.js', 'test/**/*.js']
    },
    docco: {
      docs: {
        src: ['lib/**/*.js', './*.md'],
        dest: ['docs'],
        options: {
          layout: 'linear',
          output: 'docs'
        }
      }
    },
    shell: {
      addlicense: {
        // this may not be the best way to do this dependency, but this isn't
        // a task we're going to run that often.
        command: 'python ../central/tools/addLicense.py "*/*.js"',
        options: {
          async: false,
          execOptions: {
            cwd: './lib/'
          }
        }
      }
    },
    mochaTest: {
      test: {
        options: {
          reporter: 'spec'
        },
        src: ['test/**/*.js']
      }
    }
  });

  // Load the plugins
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-docco2');
  grunt.loadNpmTasks('grunt-shell-spawn');
  grunt.loadNpmTasks('grunt-mocha-test');

  // Default task(s).
  grunt.registerTask('default', ['jshint', 'docco', 'mochaTest']);

};
