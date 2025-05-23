/* Copyright 2012 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * 
 * ================================
 * This file is a modified version of a part of the PDF.js library's ui_utils.js file.
 * 
 * The original file can be found at:
 * https://github.com/mozilla/pdf.js/blob/220a28933c30c34bf32ff0ac9b43fea6649b5ca2/web/ui_utils.js#L42-L70
 * 
 * Changes made:
 * - Extracted only SidebarView, ScrollMode, and SpreadMode from the original file
 * - Converted the original constant objects to TypeScript enums
 */


export enum SidebarView {
    UNKNOWN = -1,
    NONE,
    THUMBS,
    OUTLINE,
    ATTACHMENTS,
    LAYERS,
}

export enum ScrollMode {
    UNKNOWN = -1,
    VERTICAL,
    HORIZONTAL,
    WRAPPED,
    PAGE
}

export enum SpreadMode {
    UNKNOWN = -1,
    NONE,
    ODD,
    EVEN
}
