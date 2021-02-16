/*
  Copyright (c) Microsoft Corporation.

  Licensed under the Apache License, Version 2.0 (the 'License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

import './splitView.css';
import * as React from 'react';

export interface SplitViewProps {
  sidebarSize: number,
}

export const SplitView: React.FC<SplitViewProps> = ({
  sidebarSize,
  children
}) => {
  let [size, setSize] = React.useState<number>(sidebarSize);
  const [resizing, setResizing] = React.useState<{ offsetY: number } | null>(null);
  if (size < 50)
    size = 50;

  const childrenArray = React.Children.toArray(children);
  return <div className='split-view'>
    <div className='split-view-main'>{childrenArray[0]}</div>
    <div style={{flexBasis: size}} className='split-view-sidebar'>{childrenArray[1]}</div>
    <div
      style={{bottom: resizing ? 0 : size - 32, top: resizing ? 0 : undefined, height: resizing ? 'initial' : 32 }}
      className='split-view-resizer'
      onMouseDown={event => setResizing({ offsetY: event.clientY - (event.target as HTMLElement).getBoundingClientRect().y })}
      onMouseUp={() => setResizing(null)}
      onMouseMove={event => resizing ? setSize((event.target as HTMLElement).clientHeight - event.clientY + resizing.offsetY) : 0}
    ></div>
  </div>;
};
