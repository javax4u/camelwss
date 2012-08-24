Dojo Toolkit is quite large. The dev version is almmost 8000 files and 50MB+. One way of reducing the size and the number of files is to create custom build scripts. I have included the scripts I have used in this project.

The simplest way to use these is to take the build file, and drop it into 

\dojo-release-1.7.3-src\util\buildscripts\profiles

Then you navigate to:

\dojo-release-1.7.3-src\util\buildscripts\

and you can then use these commands in order to execute the build process.

When done, you will find the folder where Dojo have built the build - and only copy the dojo.js and dojo.js.uncompressed.js to your java projects. 1 file, and quite small. The uncompressed is for the readable code while ... you know ... coding :)

There is several measurement you can take in order to make the build better in terms of size, and number of files.

This project is a Camel demo of websockets on server-side, and not a particular client-side demonstration.


.\build.bat --profile my-ws-basic -r

.\build.bat --profile my-ws-chart -r

.\build.bat --profile my-ws-heartbeat -r

