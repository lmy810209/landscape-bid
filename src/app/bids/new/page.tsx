import BidForm from "@/components/BidForm";

export default function NewBidPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">입찰 등록</h1>
      <p className="text-sm text-slate-600">
        공고 정보, 내 투찰가, 결과(있다면)를 입력하세요. 결과/투찰가는 비워둬도 됩니다.
      </p>
      <BidForm />
    </div>
  );
}
