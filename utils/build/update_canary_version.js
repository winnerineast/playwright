#!/usr/bin/env node
/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const packageJSON = require('../../package.json');
if (process.argv[2] === '--today-date') {
  const date = new Date();
  const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'][date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();
  packageJSON.version = `${packageJSON.version}-alpha-${month}-${day}-${year}`;
} else if (process.argv[2] === '--commit-timestamp') {
  const timestamp = execSync('git show -s --format=%ct HEAD', {
    stdio: ['ignore', 'pipe', 'ignore']
  }).toString('utf8').trim();
  packageJSON.version = `${packageJSON.version}-${timestamp}000`;
} else {
  throw new Error('This script must be run with either --timestamp or --today-date parameter');
}
console.log('Setting version to ' + packageJSON.version);
fs.writeFileSync(path.join(__dirname, '..', '..', 'package.json'), JSON.stringify(packageJSON, undefined, 2) + '\n');
