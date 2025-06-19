import { accountService } from "./services/account-service";
import { transactionService } from "./services/transaction-service.svelte";
import { categoryService } from "./services/category-service";

class DataService {
    private static _instance: DataService;
    public transactionsReady: Promise<void>;
    public accountsReady: Promise<void>;
    public categoryReady: Promise<void>;

    private constructor() {
        this.transactionsReady = transactionService.ready;
        this.accountsReady = accountService.ready;
        this.categoryReady = categoryService.ready;
    }

    public static async getInstance(): Promise<DataService> {
        if (!DataService._instance) {
            DataService._instance = new DataService();
            await Promise.all([
                DataService._instance.transactionsReady,
                DataService._instance.accountsReady,
                DataService._instance.categoryReady
            ]);
        }
        return DataService._instance;
    }
}

export const dataService = await DataService.getInstance();