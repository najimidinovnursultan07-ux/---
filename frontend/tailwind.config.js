/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#182329",
        muted: "#738087",
        canvas: "#f2f5f0",
        coral: {
          DEFAULT: "#e86f51",
          dark: "#bd4f36",
        },
        forest: {
          DEFAULT: "#24734d",
          soft: "#e3f2e7",
        },
      },
      fontFamily: {
        sans: ["Manrope", "sans-serif"],
        display: ["Unbounded", "sans-serif"],
      },
      boxShadow: {
        panel: "0 24px 70px rgba(46, 67, 57, 0.11)",
      },
    },
  },
  plugins: [],
};
