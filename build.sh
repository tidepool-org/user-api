#! /bin/bash -eu

rm -rf node_modules
npm install .

BUILD_DIR=build

function cleanup {
  echo "Killing pid[$1]"
  kill -9 $1;
  echo "Deleting the build directory: ${BUILD_DIR}"
  rm -r ${BUILD_DIR};
}

rm -rf ${BUILD_DIR}
DBPATH=${BUILD_DIR}/mongo
mkdir -p ${DBPATH}
mongod --dbpath ${DBPATH} --logpath ${BUILD_DIR}/mongo_log.log &
MONGO_PID=$!
trap "cleanup ${MONGO_PID}" EXIT

./node_modules/.bin/grunt test


