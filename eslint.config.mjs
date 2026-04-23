import obsidianPlugin from "eslint-plugin-obsidianmd";

export default [
  ...obsidianPlugin.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: "/Users/codybontecou/projects/obsidian-plugin-hub/obsidian-health-md",
      },
    },
  },
  {
    ignores: ["src/**/*.js"],
  },
];
