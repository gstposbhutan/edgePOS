# Test Accounts

Local development seed users. All created by migration `074_test_users.sql`.

**Password for all accounts:** `test1234`

## Users

| Email | Role | Sub-role | Entity | Name |
|---|---|---|---|---|
| `admin@nexus.bt` | SUPER_ADMIN | OWNER | Nexus Admin | System Admin |
| `distributor@nexus.bt` | DISTRIBUTOR | OWNER | GST Distributors | Karma Tshering |
| `wholesaler@nexus.bt` | WHOLESALER | OWNER | Thimphu Wholesale | Pema Wangchuk |
| `retailer@nexus.bt` | RETAILER | OWNER | Dawai Tshongkhang | Dawa Sherpa |
| `retailer2@nexus.bt` | RETAILER | OWNER | City Mart | Sonam Tenzin |
| `cashier@nexus.bt` | RETAILER | CASHIER | Dawai Tshongkhang | Leki Zam |
| `staff@nexus.bt` | RETAILER | STAFF | Dawai Tshongkhang | Tshering Dorji |
| `customer@nexus.bt` | CUSTOMER | CUSTOMER | Tenzin Dorji | Tenzin Dorji |

## Entities

| UUID | Name | Role | TPN |
|---|---|---|---|
| `a000...0001` | Nexus Admin | SUPER_ADMIN | TPN9990001 |
| `a000...0002` | GST Distributors | DISTRIBUTOR | TPN9990002 |
| `a000...0003` | Thimphu Wholesale | WHOLESALER | TPN9990003 |
| `a000...0004` | Dawai Tshongkhang | RETAILER | TPN9990004 |
| `a000...0005` | City Mart | RETAILER | TPN9990005 |
| `a000...0006` | Tenzin Dorji | CUSTOMER | — |

## Permission tiers

- **OWNER**: full access (`['all']`)
- **MANAGER**: full access except entity settings
- **CASHIER**: `pos:sell`, `pos:refund`, `inventory:view`, `reports:view`
- **STAFF**: `pos:sell`, `inventory:view`
- **CUSTOMER**: `orders:create`, `orders:view`, `profile:edit`

## Notes

- Dawai Tshongkhang has 3 users (owner, cashier, staff) for testing permission tiers within a single retailer
- Retailer-wholesaler links are created per-category during product import, not in this seed
- Existing demo data (Demo Store, Demo Retailer, City Mart from `999_seed_demo_data.sql`) remains untouched — these test entities use separate UUIDs (`a000...` / `a100...`) to avoid conflicts
