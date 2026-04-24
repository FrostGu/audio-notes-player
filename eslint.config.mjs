import eslintConfigNext from "eslint-config-next";

const eslintConfig = [
  {
    ignores: ["cli/dist/**", ".next/**", "node_modules/**"],
  },
  ...eslintConfigNext,
];

export default eslintConfig;
