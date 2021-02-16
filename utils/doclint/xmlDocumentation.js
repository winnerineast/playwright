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

// @ts-check
const Documentation = require('./documentation');
const { visitAll } = require('../markdown');
/**
 * @param {Documentation.MarkdownNode[]} nodes
 * @param {number} maxColumns
 */
function renderXmlDoc(nodes, maxColumns = 80, prefix = '/// ') {
  if (!nodes)
    return [];

  const renderResult = _innerRenderNodes(nodes, maxColumns);

  const doc = [];
  _wrapInNode('summary', renderResult.summary, doc);
  _wrapInNode('remarks', renderResult.remarks, doc);
  return doc.map(x => `${prefix}${x}`);
}

function _innerRenderNodes(nodes, maxColumns = 80, wrapParagraphs = true) {
  const summary = [];
  const remarks = [];
  const handleListItem = (lastNode, node) => {
    if (node && node.type === 'li' && (!lastNode || lastNode.type !== 'li'))
      summary.push(`<list type="${node.liType}">`);
    else if (lastNode && lastNode.type === 'li' && (!node || node.type !== 'li'))
      summary.push('</list>');

  };

  let lastNode;
  visitAll(nodes, node => {
    // handle special cases first
    if (_nodeShouldBeIgnored(node))
      return;
    if (node.text && node.text.startsWith('extends: ')) {
      remarks.push('Inherits from ' + node.text.replace('extends: ', ''));
      return;
    }
    handleListItem(lastNode, node);
    if (node.type === 'text') {
      if (wrapParagraphs)
        _wrapInNode('para', _wrapAndEscape(node, maxColumns), summary);
      else
        summary.push(..._wrapAndEscape(node, maxColumns));
    } else if (node.type === 'code' && node.codeLang === 'csharp') {
      _wrapInNode('code', node.lines, summary);
    } else if (node.type === 'li') {
      _wrapInNode('item><description', _wrapAndEscape(node, maxColumns), summary, '/description></item');
    } else if (node.type === 'note') {
      _wrapInNode('para', _wrapAndEscape(node, maxColumns), remarks);
    }
    lastNode = node;
  });
  handleListItem(lastNode, null);

  return { summary, remarks };
}

function _wrapInNode(tag, nodes, target, closingTag = null) {
  if (nodes.length === 0)
    return;

  if (!closingTag)
    closingTag = `/${tag}`;

  if (nodes.length === 1) {
    target.push(`<${tag}>${nodes[0]}<${closingTag}>`);
    return;
  }

  target.push(`<${tag}>`);
  target.push(...nodes);
  target.push(`<${closingTag}>`);
}

/**
 *
 * @param {Documentation.MarkdownNode} node
 */
function _wrapAndEscape(node, maxColumns = 0) {
  const lines = [];
  const pushLine = text => {
    if (text === '')
      return;
    text = text.trim();
    lines.push(text);
  };

  const text = node.text.replace(/[^\[]`([^\]]*[^\[])`[^\]]/g, (m, g1) => ` <c>${g1}</c> `);
  const words = text.split(' ');
  let line = '';
  for (let i = 0; i < words.length; i++) {
    line = line + ' ' + words[i];
    if (line.length >= maxColumns) {
      pushLine(line);
      line = '';
    }
  }

  pushLine(line);
  return lines;
}

/**
 *
 * @param {Documentation.MarkdownNode} node
 */
function _nodeShouldBeIgnored(node) {
  if (!node
    || (node.text === 'extends: [EventEmitter]'))
    return true;

  return false;
}

/**
 * @param {Documentation.MarkdownNode[]} nodes
 */
function renderTextOnly(nodes, maxColumns = 80) {
  const result = _innerRenderNodes(nodes, maxColumns, false);
  return result.summary;
}

module.exports = { renderXmlDoc, renderTextOnly }