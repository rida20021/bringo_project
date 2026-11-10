# Bringo Planning & Shift Management Reference

This document defines the legacy Excel formats for rider planning and how they map to the new `shifts` database schema.

## 1. Status Mapping (Excel to Database)

| Excel Value | Database Enum (`status`) | Meaning |
| :--- | :--- | :--- |
| `09H-21H` (Marrakech) | `present` | Standard working day. |
| `Présent` (Casablanca) | `present` | Standard working day. |
| `R` (Marrakech) | `off` | Repos (Rest day). |
| `OFF` (Casablanca) | `off` | Rest day. |
| `Meal Box` | `meal_box` | Rider is working (often for a restaurant client), requires a `targetMarketId`. |
| `Renfort [Market Name]` | `renfort` | Rider is reinforcing another market. Requires a `targetMarketId`. |

## 2. Casablanca Format Example
*Focuses on statuses rather than specific hours.*

**CARREFOUR Ville Verte**
| NOM | Lundi | Mardi | Mercredi | Jeudi | Vendredi | Samedi | Dimanche |
|---|---|---|---|---|---|---|---|
| Ibrahim Dada | Présent | Présent | Meal Box | Présent | Présent | Présent | Présent |
| Hamza Alam | Présent | OFF | Présent | Présent | Présent | Présent | Présent |
| Aymane Aboulkheire | Présent | Présent | Présent | Présent | Renfort Lissasfa | Renfort Lissasfa | OFF |

## 3. Marrakech Format Example
*Focuses on specific hours rather than statuses.*

**CARREFOUR MENARA MALL**
| NOM | Lundi | Mardi | Mercredi | Jeudi | Vendredi | Samedi | Dimanche |
|---|---|---|---|---|---|---|---|
| Samir | 09H-21H | 09H-21H | 09H-21H | 09H-21H | 09H-21H | R | 09H-21H |
| Ahmed | R | 09H-21H | 09H-21H | 09H-21H | 09H-21H | 09H-21H | 09H-21H |
| Fadlallah | 09H-21H | 09H-21H | 09H-21H | 09H-21H |  | 09H-21H | R |

## 4. Core Business Rules for Shift Planning

1.  **Home Market Base:** Every rider is assigned to a base `homeMarketId` (e.g., Samir belongs to Menara Mall). By default, their schedule is applied to this market.
2.  **Renfort (Reinforcement):** If a rider is marked as `renfort`, they must be assigned a `targetMarketId`. They will physically work at this target market for that specific day.
3.  **Meal Box:** Similar to Renfort, but specifically for restaurant deliveries. It requires a `targetMarketId`.
4.  **The Market Access Rule (Crucial):**
    *   When a rider opens their Live Entry form, they should normally only see their Home Market.
    *   **EXCEPTION:** If the `shifts` table has a `renfort` or `meal_box` entry for this rider for *today*, the `targetMarketId` must be dynamically added to their allowed markets for that specific day.
5.  **Payroll vs Planning:** The Planning (shifts) is a *forecast*. Payroll is calculated from the *Actual* Attendance (JO Excel). The Admin can override both.