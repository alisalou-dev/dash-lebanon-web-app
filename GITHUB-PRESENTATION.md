# GitHub repository presentation

Suggested settings for the repository's **About** panel:

- **Description:** `A Lebanon-focused online storefront built with HTML, CSS, JavaScript, Supabase, and Vercel.`
- **Website:** `https://www.dashlb.shop`
- **Topics:** `lebanon`, `ecommerce`, `supabase`, `javascript`, `typescript`, `vercel`, `online-store`
- **Repository name:** Keep `dash-lebanon-web-app` to avoid breaking existing links, or consider `dash-lebanon` after checking links and deployment connections.

## Social preview concept

Create a clean 1200 × 630 image using the store's blue and gold palette, the Dash Lebanon name, a short “Everyday products, delivered in Lebanon” line, and a small product grid. Use only product images approved for public use. Do not include customer details, order screens, admin pages, personal phone numbers, or a person's age.

## License recommendation

Do not add an open-source license yet. Confirm ownership and get a parent or guardian's guidance before choosing a license for a live business project. No license has been applied in this repository.

## Before publishing source

1. The submitted ZIP included a store contact and an administrator-login email placeholder. The improvement branch removes those fixed values; store contact links use Supabase settings and stay hidden if no contact is configured.
2. The original ZIP remains on the remote `main` branch and in an earlier commit. Remove it from the default branch after reviewing this source branch; its old Git object will remain in history.
3. GitHub's email privacy option is currently off. Turn it on before merging or making web-based commits so GitHub uses its no-reply address. Older commits are unchanged.
4. The Supabase base schema, all RLS policies, and some Edge Functions are missing from this archive; review them separately before production changes.
5. Add screenshots only after removing all customer and admin data.
