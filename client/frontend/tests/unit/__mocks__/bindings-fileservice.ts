/**
 * bindings/irisclient/service/fileservice 的测试替身。
 * 纯函数测试的传递依赖链(如 stores/ws → wsEventRouter → downloadSave)
 * 触达该子路径动态导入时,仅需模块可解析,不需要真实 IPC。
 * 真实调用形状的断言请在具体 spec 内 vi.mock 覆盖。
 */
export const FileService = {
  ReadBinaryFileBase64: () => Promise.resolve(''),
  ReadBinaryFileBase64Chunked: () => Promise.resolve(''),
  WriteBinaryFile: () => Promise.resolve(true),
  WriteBinaryFileChunked: () => Promise.resolve(true),
}
