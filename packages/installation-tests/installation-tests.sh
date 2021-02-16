#!/bin/bash
set -e
set +x

trap "cd $(pwd -P)" EXIT
cd "$(dirname $0)"

rm -rf ./output
mkdir ./output
cd ./output

# cleanup environment
unset PLAYWRIGHT_DOWNLOAD_HOST
unset PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD
export PLAYWRIGHT_BROWSERS_PATH=0

# Pack all packages and put them in our output folder.
echo "Building packages..."
PACKAGE_BUILDER="../../../packages/build_package.js"
PLAYWRIGHT_CORE_TGZ="$(node ${PACKAGE_BUILDER} playwright-core ./playwright-core.tgz)"
echo "playwright-core built"
PLAYWRIGHT_TGZ="$(node ${PACKAGE_BUILDER} playwright ./playwright.tgz)"
echo "playwright built"
PLAYWRIGHT_CHROMIUM_TGZ="$(node ${PACKAGE_BUILDER} playwright-chromium ./playwright-chromium.tgz)"
echo "playwright-chromium built"
PLAYWRIGHT_WEBKIT_TGZ="$(node ${PACKAGE_BUILDER} playwright-webkit ./playwright-webkit.tgz)"
echo "playwright-webkit built"
PLAYWRIGHT_FIREFOX_TGZ="$(node ${PACKAGE_BUILDER} playwright-firefox ./playwright-firefox.tgz)"
echo "playwright-firefox built"
PLAYWRIGHT_ELECTRON_TGZ="$(node ${PACKAGE_BUILDER} playwright-electron ./playwright-electron.tgz)"
echo "playwright-electron built"
PLAYWRIGHT_ANDROID_TGZ="$(node ${PACKAGE_BUILDER} playwright-android ./playwright-android.tgz)"
echo "playwright-android built"

SCRIPTS_PATH="$(pwd -P)/.."
TEST_ROOT="$(pwd -P)"
NODE_VERSION="$(node --version)"

function copy_test_scripts {
  cp "${SCRIPTS_PATH}/sanity.js" .
  cp "${SCRIPTS_PATH}/screencast.js" .
  cp "${SCRIPTS_PATH}/esm.mjs" .
  cp "${SCRIPTS_PATH}/esm-playwright.mjs" .
  cp "${SCRIPTS_PATH}/esm-playwright-chromium.mjs" .
  cp "${SCRIPTS_PATH}/esm-playwright-firefox.mjs" .
  cp "${SCRIPTS_PATH}/esm-playwright-webkit.mjs" .
  cp "${SCRIPTS_PATH}/sanity-electron.js" .
  cp "${SCRIPTS_PATH}/electron-app.js" .
  cp "${SCRIPTS_PATH}/driver-client.js" .
}

function run_tests {
  test_screencast
  test_typescript_types
  test_skip_browser_download
  test_playwright_global_installation_subsequent_installs
  test_playwright_should_work
  test_playwright_should_work_with_relative_home_path
  test_playwright_should_work_with_relative_browsers_path
  test_playwright_chromium_should_work
  test_playwright_webkit_should_work
  test_playwright_firefox_should_work
  test_playwright_global_installation
  test_playwright_global_installation_cross_package
  test_playwright_electron_should_work
  test_electron_types
  test_android_types
  test_playwright_cli_screenshot_should_work
  test_playwright_cli_install_should_work
  test_playwright_cli_codegen_should_work
  test_playwright_driver_should_work
}

function test_screencast {
  initialize_test "${FUNCNAME[0]}"
  copy_test_scripts

  local BROWSERS="$(pwd -P)/browsers"
  PLAYWRIGHT_BROWSERS_PATH="${BROWSERS}" npm install ${PLAYWRIGHT_TGZ}
  PLAYWRIGHT_BROWSERS_PATH="${BROWSERS}" npm install ${PLAYWRIGHT_FIREFOX_TGZ}
  PLAYWRIGHT_BROWSERS_PATH="${BROWSERS}" npm install ${PLAYWRIGHT_WEBKIT_TGZ}
  PLAYWRIGHT_BROWSERS_PATH="${BROWSERS}" npm install ${PLAYWRIGHT_CHROMIUM_TGZ}

  echo "Running screencast.js"
  PLAYWRIGHT_BROWSERS_PATH="${BROWSERS}" node screencast.js playwright
  PLAYWRIGHT_BROWSERS_PATH="${BROWSERS}" node screencast.js playwright-chromium
  PLAYWRIGHT_BROWSERS_PATH="${BROWSERS}" node screencast.js playwright-webkit
  PLAYWRIGHT_BROWSERS_PATH="${BROWSERS}" node screencast.js playwright-firefox

  echo "${FUNCNAME[0]} success"
}

function test_typescript_types {
  initialize_test "${FUNCNAME[0]}"

  # install all packages.
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install ${PLAYWRIGHT_CORE_TGZ}
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install ${PLAYWRIGHT_TGZ}
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install ${PLAYWRIGHT_FIREFOX_TGZ}
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install ${PLAYWRIGHT_WEBKIT_TGZ}
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install ${PLAYWRIGHT_CHROMIUM_TGZ}

  # typecheck all packages.
  for PKG_NAME in "playwright" \
                  "playwright-core" \
                  "playwright-firefox" \
                  "playwright-chromium" \
                  "playwright-webkit"
  do
    echo "Checking types of ${PKG_NAME}"
    echo "import { Page } from '${PKG_NAME}';" > "${PKG_NAME}.ts" && tsc "${PKG_NAME}.ts"
  done;

  echo "${FUNCNAME[0]} success"
}

function test_playwright_global_installation {
  initialize_test "${FUNCNAME[0]}"

  local BROWSERS="$(pwd -P)/browsers"
  PLAYWRIGHT_BROWSERS_PATH="${BROWSERS}" npm install ${PLAYWRIGHT_TGZ}
  if [[ ! -d "${BROWSERS}" ]]; then
    echo "Directory for shared browsers was not created!"
    exit 1
  fi
  copy_test_scripts

  echo "Running sanity.js"
  node sanity.js playwright none
  PLAYWRIGHT_BROWSERS_PATH="${BROWSERS}" node sanity.js playwright

  echo "${FUNCNAME[0]} success"
}

function test_playwright_global_installation_cross_package {
  initialize_test "${FUNCNAME[0]}"

  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install ${PLAYWRIGHT_FIREFOX_TGZ}
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install ${PLAYWRIGHT_WEBKIT_TGZ}
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install ${PLAYWRIGHT_CHROMIUM_TGZ}

  local BROWSERS="$(pwd -P)/browsers"
  PLAYWRIGHT_BROWSERS_PATH="${BROWSERS}" npm install ${PLAYWRIGHT_TGZ}
  if [[ ! -d "${BROWSERS}" ]]; then
    echo "Directory for shared browsers was not created!"
    exit 1
  fi

  copy_test_scripts

  echo "Running sanity.js"
  # Every package should be able to launch.
  PLAYWRIGHT_BROWSERS_PATH="${BROWSERS}" node sanity.js playwright-chromium all
  PLAYWRIGHT_BROWSERS_PATH="${BROWSERS}" node sanity.js playwright-firefox all
  PLAYWRIGHT_BROWSERS_PATH="${BROWSERS}" node sanity.js playwright-webkit all

  echo "${FUNCNAME[0]} success"
}

# @see https://github.com/microsoft/playwright/issues/1651
function test_playwright_global_installation_subsequent_installs {
  initialize_test "${FUNCNAME[0]}"

  local BROWSERS="$(pwd -P)/browsers"

  mkdir install-1 && pushd install-1 && npm init -y
  PLAYWRIGHT_BROWSERS_PATH="${BROWSERS}" npm install ${PLAYWRIGHT_TGZ}
  # Note: the `npm install` would not actually crash, the error
  # is merely logged to the console. To reproduce the error, we should make
  # sure that script's install.js can be run subsequently without unhandled promise rejections.
  # Note: the flag `--unahdnled-rejections=strict` will force node to terminate in case
  # of UnhandledPromiseRejection.
  PLAYWRIGHT_BROWSERS_PATH="${BROWSERS}" node --unhandled-rejections=strict node_modules/playwright/install.js

  echo "${FUNCNAME[0]} success"
}

function test_skip_browser_download {
  initialize_test "${FUNCNAME[0]}"

  OUTPUT=$(PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install ${PLAYWRIGHT_TGZ})
  if [[ "${OUTPUT}" != *"Skipping browsers download because"* ]]; then
    echo "missing log message that browsers download is skipped"
    exit 1
  fi

  if [[ -d ./node_modules/playwright/.local-browsers ]]; then
    echo "local browsers folder should be empty"
    exit 1
  fi

  echo "${FUNCNAME[0]} success"
}

function test_playwright_should_work {
  initialize_test "${FUNCNAME[0]}"

  OUTPUT=$(npm install ${PLAYWRIGHT_TGZ})
  if [[ "${OUTPUT}" != *"chromium"* ]]; then
    echo "ERROR: should download chromium"
    exit 1
  fi
  if [[ "${OUTPUT}" != *"firefox"* ]]; then
    echo "ERROR: should download firefox"
    exit 1
  fi
  if [[ "${OUTPUT}" != *"webkit"* ]]; then
    echo "ERROR: should download webkit"
    exit 1
  fi
  copy_test_scripts

  echo "Running sanity.js"
  node sanity.js playwright
  if [[ "${NODE_VERSION}" == *"v14."* ]]; then
    echo "Running esm.js"
    node esm-playwright.mjs
  fi

  echo "${FUNCNAME[0]} success"
}

function test_playwright_should_work_with_relative_home_path {
  initialize_test "${FUNCNAME[0]}"
  PLAYWRIGHT_BROWSERS_PATH="" HOME=. npm install ${PLAYWRIGHT_TGZ}
  copy_test_scripts
  echo "Running sanity.js"
  # Firefox does not work with relative HOME.
  PLAYWRIGHT_BROWSERS_PATH="" HOME=. node sanity.js playwright chromium webkit
  echo "${FUNCNAME[0]} success"
}

function test_playwright_should_work_with_relative_browsers_path {
  initialize_test "${FUNCNAME[0]}"

  # Make sure that browsers path is resolved relative to the `npm install` call location.
  mkdir foo
  cd foo
  PLAYWRIGHT_BROWSERS_PATH="../relative" npm install ${PLAYWRIGHT_TGZ}
  cd ..

  copy_test_scripts
  echo "Running sanity.js"
  PLAYWRIGHT_BROWSERS_PATH="./relative" node sanity.js playwright
  echo "${FUNCNAME[0]} success"
}

function test_playwright_chromium_should_work {
  initialize_test "${FUNCNAME[0]}"

  OUTPUT=$(npm install ${PLAYWRIGHT_CHROMIUM_TGZ})
  if [[ "${OUTPUT}" != *"chromium"* ]]; then
    echo "ERROR: should download chromium"
    exit 1
  fi
  if [[ "${OUTPUT}" == *"firefox"* ]]; then
    echo "ERROR: should not download firefox"
    exit 1
  fi
  if [[ "${OUTPUT}" == *"webkit"* ]]; then
    echo "ERROR: should not download webkit"
    exit 1
  fi
  copy_test_scripts

  echo "Running sanity.js"
  node sanity.js playwright-chromium
  if [[ "${NODE_VERSION}" == *"v14."* ]]; then
    echo "Running esm.js"
    node esm-playwright-chromium.mjs
  fi

  echo "${FUNCNAME[0]} success"
}

function test_playwright_webkit_should_work {
  initialize_test "${FUNCNAME[0]}"

  OUTPUT=$(npm install ${PLAYWRIGHT_WEBKIT_TGZ})
  if [[ "${OUTPUT}" == *"chromium"* ]]; then
    echo "ERROR: should not download chromium"
    exit 1
  fi
  if [[ "${OUTPUT}" == *"firefox"* ]]; then
    echo "ERROR: should not download firefox"
    exit 1
  fi
  if [[ "${OUTPUT}" != *"webkit"* ]]; then
    echo "ERROR: should download webkit"
    exit 1
  fi
  copy_test_scripts

  echo "Running sanity.js"
  node sanity.js playwright-webkit
  if [[ "${NODE_VERSION}" == *"v14."* ]]; then
    echo "Running esm.js"
    node esm-playwright-webkit.mjs
  fi

  echo "${FUNCNAME[0]} success"
}

function test_playwright_firefox_should_work {
  initialize_test "${FUNCNAME[0]}"

  OUTPUT=$(npm install ${PLAYWRIGHT_FIREFOX_TGZ})
  if [[ "${OUTPUT}" == *"chromium"* ]]; then
    echo "ERROR: should not download chromium"
    exit 1
  fi
  if [[ "${OUTPUT}" != *"firefox"* ]]; then
    echo "ERROR: should download firefox"
    exit 1
  fi
  if [[ "${OUTPUT}" == *"webkit"* ]]; then
    echo "ERROR: should not download webkit"
    exit 1
  fi
  copy_test_scripts

  echo "Running sanity.js"
  node sanity.js playwright-firefox
  if [[ "${NODE_VERSION}" == *"v14."* ]]; then
    echo "Running esm.js"
    node esm-playwright-firefox.mjs
  fi

  echo "${FUNCNAME[0]} success"
}

function test_playwright_electron_should_work {
  initialize_test "${FUNCNAME[0]}"

  npm install ${PLAYWRIGHT_ELECTRON_TGZ}
  npm install electron@9.0
  copy_test_scripts

  echo "Running sanity-electron.js"
  xvfb-run --auto-servernum -- bash -c "node sanity-electron.js"

  echo "${FUNCNAME[0]} success"
}

function test_electron_types {
  initialize_test "${FUNCNAME[0]}"
  npm install ${PLAYWRIGHT_ELECTRON_TGZ}
  npm install electron@9.0
  npm install -D typescript@3.8
  npm install -D @types/node@10.17
  echo "import { Page, electron, ElectronApplication, Electron } from 'playwright-electron';" > "test.ts"

  echo "Running tsc"
  npx tsc "test.ts"

  echo "${FUNCNAME[0]} success"
}

function test_android_types {
  initialize_test "${FUNCNAME[0]}"

  npm install ${PLAYWRIGHT_ANDROID_TGZ}
  npm install -D typescript@3.8
  npm install -D @types/node@10.17
  echo "import { AndroidDevice, android, AndroidWebView, Page } from 'playwright-android';" > "test.ts"

  echo "Running tsc"
  npx tsc "test.ts"

  echo "${FUNCNAME[0]} success"
}

function test_playwright_cli_screenshot_should_work {
  initialize_test "${FUNCNAME[0]}"

  npm install ${PLAYWRIGHT_TGZ}

  echo "Running playwright screenshot"

  node_modules/.bin/playwright screenshot about:blank one.png
  if [[ ! -f one.png ]]; then
    echo 'node_modules/.bin/playwright does not work'
    exit 1
  fi

  npx playwright screenshot about:blank two.png
  if [[ ! -f two.png ]]; then
    echo 'npx playwright does not work'
    exit 1
  fi

  echo "${FUNCNAME[0]} success"
}

function test_playwright_cli_install_should_work {
  initialize_test "${FUNCNAME[0]}"

  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install ${PLAYWRIGHT_TGZ}

  local BROWSERS="$(pwd -P)/browsers"

  echo "Running playwright install chromium"
  OUTPUT=$(PLAYWRIGHT_BROWSERS_PATH=${BROWSERS} npx playwright install chromium)
  if [[ "${OUTPUT}" != *"chromium"* ]]; then
    echo "ERROR: should download chromium"
    exit 1
  fi
  if [[ "${OUTPUT}" == *"webkit"* ]]; then
    echo "ERROR: should not download webkit"
    exit 1
  fi
  if [[ "${OUTPUT}" == *"firefox"* ]]; then
    echo "ERROR: should not download firefox"
    exit 1
  fi

  echo "Running playwright install"
  OUTPUT=$(PLAYWRIGHT_BROWSERS_PATH=${BROWSERS} npx playwright install)
  if [[ "${OUTPUT}" == *"chromium"* ]]; then
    echo "ERROR: should not download chromium"
    exit 1
  fi
  if [[ "${OUTPUT}" != *"webkit"* ]]; then
    echo "ERROR: should download webkit"
    exit 1
  fi
  if [[ "${OUTPUT}" != *"firefox"* ]]; then
    echo "ERROR: should download firefox"
    exit 1
  fi

  copy_test_scripts
  echo "Running sanity.js"
  node sanity.js playwright none
  PLAYWRIGHT_BROWSERS_PATH="${BROWSERS}" node sanity.js playwright

  echo "${FUNCNAME[0]} success"
}

function test_playwright_cli_codegen_should_work {
  initialize_test "${FUNCNAME[0]}"

  npm install ${PLAYWRIGHT_TGZ}

  echo "Running playwright codegen"
  OUTPUT=$(PWCLI_EXIT_FOR_TEST=1 xvfb-run --auto-servernum -- bash -c "npx playwright codegen")
  if [[ "${OUTPUT}" != *"chromium.launch"* ]]; then
    echo "ERROR: missing chromium.launch in the output"
    exit 1
  fi
  if [[ "${OUTPUT}" != *"browser.close"* ]]; then
    echo "ERROR: missing browser.close in the output"
    exit 1
  fi

  echo "Running playwright codegen --target=python"
  OUTPUT=$(PWCLI_EXIT_FOR_TEST=1 xvfb-run --auto-servernum -- bash -c "npx playwright codegen --target=python")
  if [[ "${OUTPUT}" != *"chromium.launch"* ]]; then
    echo "ERROR: missing chromium.launch in the output"
    exit 1
  fi
  if [[ "${OUTPUT}" != *"browser.close"* ]]; then
    echo "ERROR: missing browser.close in the output"
    exit 1
  fi

  echo "${FUNCNAME[0]} success"
}

function test_playwright_driver_should_work {
  initialize_test "${FUNCNAME[0]}"

  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install ${PLAYWRIGHT_TGZ}

  echo "Running playwright install"
  PLAYWRIGHT_BROWSERS_PATH="0" npx playwright install

  copy_test_scripts
  echo "Running driver-client.js"
  PLAYWRIGHT_BROWSERS_PATH="0" node driver-client.js

  echo "${FUNCNAME[0]} success"
}

function initialize_test {
  cd ${TEST_ROOT}
  local TEST_NAME="./$1"
  echo "====================================================================================="
  echo "====================================================================================="
  echo
  echo "  RUNNING TEST:  ${TEST_NAME}"
  echo
  echo "====================================================================================="
  echo "====================================================================================="
  mkdir ${TEST_NAME} && cd ${TEST_NAME} && npm init -y
}

# Run all tests
# Script will terminate if there's some error somewhere.
run_tests

echo
echo "SUCCESS!"
