# Budgic

> **Smart, emotionally intelligent personal finance management**

Budgic is a sophisticated personal financial management system built with modern web technologies. It's designed to be a smart financial companion that adapts to your life stage and behavioral patterns, helping you manage your money with confidence.

![SvelteKit](https://img.shields.io/badge/SvelteKit-2.0-FF3E00?logo=svelte)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.0-38B2AC?logo=tailwind-css)
![PWA](https://img.shields.io/badge/PWA-enabled-4285F4?logo=pwa)

## ✨ Features

### 💰 **Core Financial Management**
- **Multi-Account Support**: Manage checking, savings, credit, cash, investment, and crypto accounts
- **Transaction Tracking**: Record income, expenses, transfers, and adjustments with full categorization
- **Split Transactions**: Handle complex bills with multiple categories and amounts
- **Recurring Transactions**: Automate recurring bills and income
- **Transaction States**: Track planned, pending, cleared, and cancelled transactions

### 📊 **Unified Budget System**
- **Waterfall Budgeting**: Four-tier priority-based allocation system
  - **Survival**: Essential needs (rent, groceries, utilities)
  - **Security**: Emergency funds, debt payments
  - **Growth**: Investments, education, savings
  - **Lifestyle**: Entertainment, discretionary spending
- **Smart Category Management**: Unified categories that serve both categorization and budgeting
- **Budget Tracking**: Real-time budget monitoring with visual progress indicators

### 🎯 **Goals & Planning**
- **Financial Goals**: Set and track savings goals with target dates
- **Goal Categories**: Emergency fund, vacation, house down payment, retirement, and more
- **Progress Tracking**: Monitor goal progress with visual indicators
- **Recurring Contributions**: Automate monthly contributions to goals

### 📈 **Analytics & Insights**
- **Spending Analysis**: Comprehensive spending trends and category breakdowns
- **Predictive Analytics**: Spending predictions and anomaly detection
- **Financial Health**: Overall financial health scoring and recommendations
- **Behavioral Patterns**: Track spending patterns and provide personalized insights
- **Smart Notifications**: Actionable insights and alerts

### 🌍 **Multi-Currency Support**
- **Currency Management**: Support for multiple currencies including crypto (BTC, ETH)
- **Currency Formatting**: Proper formatting based on currency rules
- **Currency Registry**: Built-in support for major world currencies

### 📱 **Progressive Web App (PWA)**
- **Offline-First**: Fully functional offline using IndexedDB
- **Installable**: Install as a native app on mobile and desktop
- **Fast & Responsive**: Optimized for mobile and desktop experiences
- **Service Worker**: Automatic updates and caching

### 🎨 **User Experience**
- **Progressive Onboarding**: Maturity-based feature introduction
- **Adaptive Interface**: Personalize experience based on user behavior
- **Dark Mode**: Beautiful dark theme
- **Internationalization**: Multi-language support (English, Russian)

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+ 
- **npm** or **yarn**
- Modern web browser with IndexedDB support

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/budgic.git
   cd budgic
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm run dev
   ```

4. **Open your browser**
   Navigate to `http://localhost:5173` (or the port shown in the terminal)

### Building for Production

```bash
# Build the application
npm run build

# Preview the production build
npm run preview
```

The built files will be in the `build/` directory, ready for deployment to any static hosting service.

## 🏗️ Project Structure

```
budgic/
├── src/
│   ├── lib/
│   │   ├── core/
│   │   │   ├── db.ts                    # Database schema and Dexie setup
│   │   │   └── services/                # Business logic services
│   │   │       ├── core/                # Core services (accounts, transactions, budget, etc.)
│   │   │       ├── analytics/           # Analytics and insights services
│   │   │       └── pages/               # Page-specific services
│   │   ├── components/                  # Reusable UI components
│   │   │   ├── ui/                      # shadcn-svelte components
│   │   │   └── [feature].svelte         # Feature-specific components
│   │   ├── utils/                       # Utility functions
│   │   └── paraglide/                   # Internationalization
│   ├── routes/                          # SvelteKit pages
│   │   ├── +page.svelte                # Home/Dashboard
│   │   ├── accounts/                   # Account management
│   │   ├── transactions/               # Transaction management
│   │   ├── budget/                     # Budget planning
│   │   ├── goals/                       # Goals tracking
│   │   ├── insights/                   # Analytics and insights
│   │   ├── settings/                       # User settings
│   │   └── onboarding/                  # Onboarding flow
│   └── app.html                        # HTML template
├── static/                              # Static assets
├── docs/                                # Documentation
└── package.json
```

## 🛠️ Technology Stack

### Core Technologies
- **[SvelteKit 2](https://kit.svelte.dev/)** - Full-stack framework
- **[Svelte 5](https://svelte.dev/)** - UI framework with runes
- **[TypeScript](https://www.typescriptlang.org/)** - Type safety
- **[Dexie.js](https://dexie.org/)** - IndexedDB wrapper
- **[Zod](https://zod.dev/)** - Schema validation

### UI & Styling
- **[Tailwind CSS 4](https://tailwindcss.com/)** - Utility-first CSS
- **[shadcn-svelte](https://www.shadcn-svelte.com/)** - UI component library
- **[Melt UI](https://melt-ui.com/)** - Headless UI components
- **[Lucide Icons](https://lucide.dev/)** - Icon library

### Additional Tools
- **[Vite](https://vitejs.dev/)** - Build tool
- **[PWA](https://vite-pwa-org.netlify.app/)** - Progressive Web App support
- **[Inlang](https://inlang.com/)** - Internationalization
- **[LayerChart](https://layerchart.com/)** - Data visualization

## 📚 Key Concepts

### Waterfall Budgeting
Budgic uses a unique waterfall budgeting system that prioritizes spending across four tiers:
1. **Survival** - Essential needs that must be met first
2. **Security** - Emergency funds and debt management
3. **Growth** - Investments and future planning
4. **Lifestyle** - Discretionary spending

### Transaction States
- **Planned**: Future transactions you expect to occur
- **Pending**: Transactions imported from bank but not yet categorized
- **Cleared**: Finalized and categorized transactions
- **Cancelled**: Planned transactions that didn't happen

### Unified Categories
Categories in Budgic serve dual purposes:
- **Categorization**: Organize transactions by type
- **Budgeting**: Define budget allocations and track spending

## 🧪 Development

### Available Scripts

```bash
# Development
npm run dev              # Start development server
npm run check           # Type checking
npm run check:watch     # Type checking in watch mode

# Code Quality
npm run lint            # Run linter
npm run format          # Format code with Prettier

# Build
npm run build           # Build for production
npm run preview         # Preview production build
```

### Development Guidelines

- **Type Safety**: All code must be properly typed with no `any` types
- **Validation**: Use Zod schemas for all data validation
- **Service Architecture**: Follow service-oriented architecture patterns
- **Component Structure**: Use Svelte 5 runes (`$state`, `$derived`, `$effect`)
- **Styling**: Prefer Tailwind utilities over custom CSS
- **Error Handling**: Implement comprehensive error handling at all layers

## 🗄️ Database Schema

Budgic uses IndexedDB with the following core tables:

- **accounts** - Financial accounts (checking, savings, credit, etc.)
- **currencies** - Currency definitions and settings
- **categories** - Budget categories with waterfall tiers
- **transactions** - All financial transactions
- **goals** - Financial goals and targets
- **userPreferences** - User settings and preferences
- **userActions** - User behavior tracking
- **insights** - Generated insights and notifications

All entities support:
- Soft deletes (via `deletedAt` field)
- Audit timestamps (`createdAt`, `updatedAt`)
- Comprehensive validation via Zod schemas

## 🌐 Browser Support

Budgic works in all modern browsers that support:
- IndexedDB
- ES2020+ JavaScript features
- CSS Grid and Flexbox
- Service Workers (for PWA features)

## 📖 Documentation

Additional documentation is available in the `docs/` directory:

- [Architecture Overview](./docs/ARCHITECTURE_DIAGRAM.md)
- [Service Architecture](./docs/SERVICE_ARCHITECTURE.md)
- [Implementation Guide](./docs/IMPLEMENTATION_GUIDE.md)
- [Route Structure](./docs/COMPREHENSIVE_ROUTE_ANALYSIS.md)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

### Contribution Guidelines

1. Follow the existing code style and architecture patterns
2. Ensure all TypeScript types are properly defined
3. Add Zod validation for new data structures
4. Write clear commit messages
5. Test your changes thoroughly

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [SvelteKit](https://kit.svelte.dev/)
- UI components inspired by [shadcn/ui](https://ui.shadcn.com/)
- Icons provided by [Lucide](https://lucide.dev/)

## 📧 Contact

For questions, suggestions, or support, please open an issue on GitHub.

---

**Made with ❤️ for better financial management**
