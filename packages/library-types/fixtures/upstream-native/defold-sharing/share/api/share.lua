--[[
Share
Defold native extension to share application data using native sharing dialogs.
--]]

---@meta
---@diagnostic disable: lowercase-global
---@diagnostic disable: missing-return

---@class defold_api.share
share = {}

---@class share.file_options
---@field type? string Data type. Default is `text/plain`.
---@field text? string Text to be shared.
---@field title? string Title to be shared. May be ignored by the target
---@field url? string URL to be shared.

---Share text using a native sharing dialog.
---@param text string The text to share
function share.text(text) end

---Share an image (with optional text) using a native sharing dialog. Supported formats depend on the platform:
---- Android - The image format must be supported by BitmapFactory.decodeByteArray(). On Android the image will first be stored locally as a file and then shared using a FileProvider.
---- iOS and macOS - The image format must be supported by UIImage.initWithData.
---- HTML5 - Either DataURI or any image format supported by the underlying platform.
---@param bytes string The image bytes to share
---@param text? string Optional text to share
---@param file_name? string Optional and only for HTML5 image name. Default is `file.png`.
function share.image(bytes, text, file_name) end

---Share a file (with optional text) using a native sharing dialog.
---On Android the file will first be copied to a predefined location and then shared using a FileProvider.
---Files are shared with their original filename and extension.
---This will allow iOS to offer different kinds of applications depending on the shared content.
---@param path string Full path to the file to share. For HTML5: specify the name of the file. Default is `file.txt`.
---@param text? string Optional text to share. For HTML5: specify the data that should be in the file.
---@param options? share.file_options Optional and only for HTML5.
function share.file(path, text, options) end