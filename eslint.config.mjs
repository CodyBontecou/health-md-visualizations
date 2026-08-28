import obsidianPlugin from "eslint-plugin-obsidianmd";

export default [
  ...obsidianPlugin.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    ignores: ["src/**/*.js"],
  },
];
