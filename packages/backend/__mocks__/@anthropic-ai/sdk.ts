// Stub mock for @anthropic-ai/sdk used in Jest tests
const Anthropic = jest.fn().mockImplementation(() => ({
  messages: { create: jest.fn() },
}));

export default Anthropic;
