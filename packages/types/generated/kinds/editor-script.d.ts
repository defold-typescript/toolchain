/// <reference types="lua-types/5.1" />
import "../editor";
import "../editor-vm/http";
import "../editor-vm/json";
import "../editor-vm/localization";
import "../editor-vm/zip";
import "../editor-vm/zlib";
import "../editor-vm/tilemap_tiles";
import "../../src/editor-overloads";
import "../../src/editor-vm-globals";

export { defineEditorScript, defineEditorCommand } from "../../src/editor";
export type { EditorCommandQuery, EditorNode } from "../../src/editor";
