// Zajednička priprema testova: AsyncStorage kao u memoriji.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
