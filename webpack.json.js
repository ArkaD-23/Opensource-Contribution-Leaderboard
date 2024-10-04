const path = require('path');

module.exports = {
  entry: './src/index.js',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
  },
  devServer: {
    host: '0.0.0.0',
    port: 8080,
    hot: true,
    client: {
      webSocketURL: 'ws://localhost:8080/ws',
    },
  },
  mode: 'development',
};

  