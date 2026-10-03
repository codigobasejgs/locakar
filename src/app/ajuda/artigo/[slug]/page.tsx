import ArticleDetail from "@/help/components/article";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ArticleDetail slug={slug} />;
}
