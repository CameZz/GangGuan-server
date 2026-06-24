// 测试设置文件

// 设置测试环境变量
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = 'mysql://root:123456@localhost:3306/gangguan_test'

// Placeholder test to prevent "must contain at least one test" error
describe('Test setup', () => {
  it('should have test environment configured', () => {
    expect(process.env.NODE_ENV).toBe('test')
  })
})
