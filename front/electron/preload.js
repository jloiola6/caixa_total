const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("caixaDesktop", {
  printHtmlSilently: (html) => ipcRenderer.invoke("desktop:print-html-silent", html),
  printTextSilently: (text, options) =>
    ipcRenderer.invoke("desktop:print-text-silent", text, options),
  listPrinters: () => ipcRenderer.invoke("desktop:list-printers"),
});
