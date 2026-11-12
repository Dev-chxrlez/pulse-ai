const median = values => { const sorted = [...values].sort((a,b)=>a-b); const middle=Math.floor(sorted.length/2); return sorted.length%2 ? sorted[middle] : (sorted[middle-1]+sorted[middle])/2; };
// Short-form posts accumulate most lifetime views within days. Posts this old at measurement
// are compared on lifetime counts; younger posts are listed but excluded from rankings.
export const MATURE_SECONDS = 7 * 24 * 3600;
export function nicheStatistics(posts) {
  const ages = posts.map(post => post.publishedAt && post.collectedAt ? (Date.parse(post.collectedAt)-Date.parse(post.publishedAt))/1000 : null);
  const valid = age => Number.isFinite(age) && age > 0;
  const equalWindows = posts.length >= 2 && ages.every(valid) && new Set(ages).size === 1;
  const mode = equalWindows ? 'equal_age' : 'mature_lifetime';
  const rows = posts.map((post,index)=>({postId:post.postId,ageSeconds:ages[index],comparable:equalWindows||(valid(ages[index])&&ages[index]>=MATURE_SECONDS),views:post.metrics.views,interactionsPerView:post.metrics.views>0 && ['likes','comments','shares'].every(key=>post.metrics[key]!==null) ? (post.metrics.likes+post.metrics.comments+post.metrics.shares)/post.metrics.views*100 : null}));
  const included = rows.filter(row=>row.comparable);
  const excludedPostIds = rows.filter(row=>!row.comparable).map(row=>row.postId);
  const comparable = included.length >= 2;
  const reason = posts.length < 2 ? 'At least two posts are needed.'
    : equalWindows ? 'Same elapsed publication-to-collection interval; comparison assumes counts accumulate since publication.'
    : comparable ? `Comparing lifetime counts of ${included.length} posts that were at least 7 days old when measured.${excludedPostIds.length?` ${excludedPostIds.length} newer or undated post${excludedPostIds.length===1?' is':'s are'} excluded for now.`:''}`
    : 'Fewer than two posts were at least 7 days old when measured (or dates are missing). Rankings and the baseline are withheld.';
  function ranks(field) {
    if(!comparable) return [];
    const eligible=included.filter(row=>row[field]!==null);
    if(eligible.length<2)return [];
    return eligible.map(row=>({postId:row.postId,value:row[field],rank:1+eligible.filter(other=>other[field]>row[field]).length})).sort((a,b)=>a.rank-b.rank);
  }
  const knownViews = included.filter(row=>row.views!==null);
  const baseline = comparable && knownViews.length >= 3 ? median(knownViews.map(row=>row.views)) : null;
  return { sampleSize:posts.length,exploratory:true,comparable,mode,minimumAgeSeconds:equalWindows?null:MATURE_SECONDS,excludedPostIds,reason,windowSeconds:equalWindows?ages[0]:null,rows,viewsRanking:ranks('views'),engagementRanking:ranks('interactionsPerView'),baselineViews:baseline,aboveBaseline:baseline===null?[]:knownViews.filter(row=>row.views>baseline).map(row=>row.postId),belowBaseline:baseline===null?[]:knownViews.filter(row=>row.views<baseline).map(row=>row.postId),limitations:['A small sample of posts; not a complete account baseline.','Equal or mature (7+ day) age is a comparison proxy, not proof of identical audience, paid distribution, or metric definitions. Older posts may still be gaining views.','Metrics are user-supplied counts, not independently verified.','No causal conclusions, performance probabilities, or future-view estimates.'] };
}
