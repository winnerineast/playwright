#!/bin/bash
set -e
set +x

trap "cd $(pwd -P)" EXIT
cd "$(dirname $0)"

USAGE=$(cat<<EOF
  usage: $(basename $0) [--mirror|--mirror-linux|--mirror-win32|--mirror-win64|--mirror-mac|--compile-mac-arm64|--compile-linux|--compile-win32|--compile-win64|--compile-mac]

  Either compiles chromium or mirrors it from Chromium Continuous Builds CDN.
EOF
)

SCRIPT_PATH=$(pwd -P)
CRREV=$(head -1 ./BUILD_NUMBER)

main() {
  if [[ $1 == "--help" || $1 == "-h" ]]; then
    echo "$USAGE"
    exit 0
  elif [[ $1 == "--mirror"* ]]; then
    mirror_chromium $1
  elif [[ $1 == "--compile"* ]]; then
    compile_chromium $1
  else
    echo "ERROR: unknown first argument. Use --help for details."
    exit 1
  fi
}


compile_chromium() {
  if [[ -z "${CR_CHECKOUT_PATH}" ]]; then
    echo "ERROR: chromium compilation requires CR_CHECKOUT_PATH to be set to reuse checkout."
    exit 1
  fi

  # install depot_tools if they are not in system
  # NOTE: as of Feb 8, 2021, windows requires manual and separate
  # installation of depot_tools.
  if ! command -v autoninja >/dev/null; then
    if [[ ! -d "${SCRIPT_PATH}/depot_tools" ]]; then
      git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git "${SCRIPT_PATH}/depot_tools"
    fi
    export PATH="${SCRIPT_PATH}/depot_tools:$PATH"
  fi

  CHROMIUM_FOLDER_NAME=""
  CHROMIUM_FILES_TO_ARCHIVE=()

  if [[ $1 == "--compile-mac-arm64" ]]; then
    # As of Jan, 2021 Chromium mac compilation requires Xcode12.2
    if [[ ! -d /Applications/Xcode12.2.app ]]; then
      echo "ERROR: chromium mac arm64 compilation requires XCode 12.2 to be available"
      echo "in the Applications folder!"
      exit 1
    fi
    export DEVELOPER_DIR=/Applications/Xcode12.2.app/Contents/Developer
    # As of Jan, 2021 Chromium mac compilation is only possible on Intel macbooks.
    # See https://chromium.googlesource.com/chromium/src.git/+/master/docs/mac_arm64.md
    if [[ $(uname -m) != "x86_64" ]]; then
      echo "ERROR: chromium mac arm64 compilation is (ironically) only supported on Intel Macbooks"
      exit 1
    fi
    CHROMIUM_FOLDER_NAME="chrome-mac"
    CHROMIUM_FILES_TO_ARCHIVE=("Chromium.app")
  elif [[ $1 == "--compile-mac" ]]; then
    export DEVELOPER_DIR=/Applications/Xcode12.2.app/Contents/Developer
    CHROMIUM_FOLDER_NAME="chrome-mac"
    CHROMIUM_FILES_TO_ARCHIVE=("Chromium.app")
  elif [[ $1 == "--compile-linux" ]]; then
    CHROMIUM_FOLDER_NAME="chrome-linux"
    CHROMIUM_FILES_TO_ARCHIVE=(
      "chrome"
      "chrome_100_percent.pak"
      "chrome_200_percent.pak"
      "chrome_sandbox"
      "chrome-wrapper"
      "ClearKeyCdm"
      "crashpad_handler"
      "icudtl.dat"
      "libEGL.so"
      "libGLESv2.so"
      "locales"
      "MEIPreload"
      "nacl_helper"
      "nacl_helper_bootstrap"
      "nacl_helper_nonsfi"
      "nacl_irt_x86_64.nexe"
      "product_logo_48.png"
      "resources"
      "resources.pak"
      "swiftshader"
      "v8_context_snapshot.bin"
      "xdg-mime"
      "xdg-settings"
    )
  elif [[ $1 == "--compile-win"* ]]; then
    CHROMIUM_FOLDER_NAME="chrome-win"
    CHROMIUM_FILES_TO_ARCHIVE=(
      "chrome.dll"
      "chrome.exe"
      "chrome_100_percent.pak"
      "chrome_200_percent.pak"
      "chrome_elf.dll"
      "chrome_proxy.exe"
      "chrome_pwa_launcher.exe"
      "D3DCompiler_47.dll"
      "elevation_service.exe"
      "eventlog_provider.dll"
      "First Run"
      "icudtl.dat"
      "libEGL.dll"
      "libGLESv2.dll"
      "locales"
      "MEIPreload"
      "mojo_core.dll"
      "nacl_irt_x86_64.nexe"
      "notification_helper.exe"
      "resources.pak"
      "swiftshader/libEGL.dll"
      "swiftshader/libGLESv2.dll"
      "v8_context_snapshot.bin"
    )
  else
    echo "ERROR: unknown command, use --help for details"
    exit 1
  fi

  # Get chromium SHA from the build revision.
  # This will get us the last redirect URL from the crrev.com service.
  REVISION_URL=$(curl -ILs -o /dev/null -w %{url_effective} "https://crrev.com/${CRREV}")
  CRSHA="${REVISION_URL##*/}"

  # Update Chromium checkout. One might think that this step should go to `prepare_checkout.sh`
  # script, but the `prepare_checkout.sh` is in fact designed to prepare a fork checkout, whereas
  # we don't fork Chromium.
  #
  # This is based on https://chromium.googlesource.com/chromium/src/+/master/docs/linux/build_instructions.md#get-the-code
  if [[ ! -d "${CR_CHECKOUT_PATH}/src" ]]; then
    rm -rf "${CR_CHECKOUT_PATH}"
    mkdir -p "${CR_CHECKOUT_PATH}"
    cd "${CR_CHECKOUT_PATH}"
    fetch --nohooks chromium
    cd src
    if [[ $(uname) == "Linux" ]]; then
      ./build/install-build-deps.sh
    fi
    gclient runhooks
  fi
  cd "${CR_CHECKOUT_PATH}/src"
  git checkout master
  git pull origin master
  git checkout "${CRSHA}"
  gclient sync

  # Prepare build folder.
  mkdir -p "./out/Default"
  cat <<EOF>./out/Default/args.gn
is_debug = false
symbol_level = 0
EOF

  if [[ $1 == "--compile-mac-arm64" ]]; then
    echo 'target_cpu = "arm64"' >> ./out/Default/args.gn
  elif [[ $1 == "--compile-win32" ]]; then
    echo 'target_cpu = "x86"' >> ./out/Default/args.gn
  fi

  if [[ ! -z "$USE_GOMA" ]]; then
    PLAYWRIGHT_GOMA_PATH="${SCRIPT_PATH}/electron-build-tools/third_party/goma"
    if [[ $1 == "--compile-win"* ]]; then
      PLAYWRIGHT_GOMA_PATH=$(cygpath -w "${PLAYWRIGHT_GOMA_PATH}")
    fi
    echo 'use_goma = true' >> ./out/Default/args.gn
    echo "goma_dir = \"${PLAYWRIGHT_GOMA_PATH}\"" >> ./out/Default/args.gn
  fi

  if [[ $1 == "--compile-win"* ]]; then
    if [[ -z "$USE_GOMA" ]]; then
      /c/Windows/System32/cmd.exe "/c $(cygpath -w ${SCRIPT_PATH}/buildwin.bat)"
    else
      /c/Windows/System32/cmd.exe "/c $(cygpath -w ${SCRIPT_PATH}/buildwingoma.bat)"
    fi
  else
    gn gen out/Default
    if [[ $1 == "--compile-linux" ]]; then
      TARGETS="chrome chrome_sandbox clear_key_cdm"
    else
      TARGETS="chrome"
    fi
    if [[ -z "$USE_GOMA" ]]; then
      autoninja -C out/Default $TARGETS
    else
      ninja -j 200 -C out/Default $TARGETS
    fi
  fi

  # Prepare resulting archive.
  cd "$SCRIPT_PATH"
  rm -rf output
  mkdir -p "output/${CHROMIUM_FOLDER_NAME}"

  # On Mac, use 'ditto' to copy directories instead of 'cp'.
  COPY_COMMAND="cp -R"
  if [[ $(uname) == "Darwin" ]]; then
    COPY_COMMAND="ditto"
  fi

  for ((i = 0; i < ${#CHROMIUM_FILES_TO_ARCHIVE[@]}; i++)) do
    file="${CHROMIUM_FILES_TO_ARCHIVE[$i]}"
    mkdir -p "output/${CHROMIUM_FOLDER_NAME}/$(dirname $file)"
    $COPY_COMMAND "${CR_CHECKOUT_PATH}/src/out/Default/${file}" "output/${CHROMIUM_FOLDER_NAME}/${file}"
  done

  if [[ $1 == "--compile-win"* ]]; then
    $COPY_COMMAND "${CR_CHECKOUT_PATH}/src/out/Default/"*.manifest "output/${CHROMIUM_FOLDER_NAME}/"
  fi

  cd output
  zip --symlinks -r build.zip "${CHROMIUM_FOLDER_NAME}"
}

mirror_chromium() {
  cd "$SCRIPT_PATH"
  rm -rf output
  mkdir -p output
  cd output

  CHROMIUM_URL=""
  CHROMIUM_FOLDER_NAME=""
  CHROMIUM_FILES_TO_REMOVE=()

  PLATFORM="$1"
  if [[ "${PLATFORM}" == "--mirror" ]]; then
    CURRENT_HOST_OS="$(uname)"
    if [[ "${CURRENT_HOST_OS}" == "Darwin" ]]; then
      PLATFORM="--mirror-mac"
    elif [[ "${CURRENT_HOST_OS}" == "Linux" ]]; then
      PLATFORM="--mirror-linux"
    elif [[ "${CURRENT_HOST_OS}" == MINGW* ]]; then
      PLATFORM="--mirror-win64"
    else
      echo "ERROR: unsupported host platform - ${CURRENT_HOST_OS}"
      exit 1
    fi
  fi

  if [[ "${PLATFORM}" == "--mirror-win32" ]]; then
    CHROMIUM_URL="https://storage.googleapis.com/chromium-browser-snapshots/Win/${CRREV}/chrome-win.zip"
    CHROMIUM_FOLDER_NAME="chrome-win"
    CHROMIUM_FILES_TO_REMOVE+=("chrome-win/interactive_ui_tests.exe")
  elif [[ "${PLATFORM}" == "--mirror-win64" ]]; then
    CHROMIUM_URL="https://storage.googleapis.com/chromium-browser-snapshots/Win_x64/${CRREV}/chrome-win.zip"
    CHROMIUM_FOLDER_NAME="chrome-win"
    CHROMIUM_FILES_TO_REMOVE+=("chrome-win/interactive_ui_tests.exe")
  elif [[ "${PLATFORM}" == "--mirror-mac" ]]; then
    CHROMIUM_URL="https://storage.googleapis.com/chromium-browser-snapshots/Mac/${CRREV}/chrome-mac.zip"
    CHROMIUM_FOLDER_NAME="chrome-mac"
  elif [[ "${PLATFORM}" == "--mirror-linux" ]]; then
    CHROMIUM_URL="https://storage.googleapis.com/chromium-browser-snapshots/Linux_x64/${CRREV}/chrome-linux.zip"
    CHROMIUM_FOLDER_NAME="chrome-linux"
  else
    echo "ERROR: unknown platform to build: $1"
    exit 1
  fi

  echo "--> Pulling Chromium ${CRREV} for ${PLATFORM#--}"

  curl --output chromium-upstream.zip "${CHROMIUM_URL}"
  unzip chromium-upstream.zip
  for file in ${CHROMIUM_FILES_TO_REMOVE[@]}; do
    rm -f "${file}"
  done

  zip --symlinks -r build.zip "${CHROMIUM_FOLDER_NAME}"
}

main $1
