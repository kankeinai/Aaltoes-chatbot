import prisma from "../../../lib/prisma";
import Image from "next/image";
import { notFound } from "next/navigation";
import { cache } from "react";

import Link from "next/link";

import Chatbot from "../../../components/Chatbot/chatbot";
import LeftMenu from "../../../components/left_menu";

import getSession from "../../../lib/getSession";
import cuid from "cuid";
import { Button } from "../../../components/ui/button";

interface PageProps {
  params: { id: string };
}

export default async function Page({ params: { id } }: PageProps) {
  const session = await getSession();
  const user = session?.user;

  const messages = await prisma.message.findMany({
    where: {
      chat_id: id
    },
    select: {
      role: true,
      content: true
    }
  })

    return (
      <main className="flex h-screen items-stretch bg-gray-50 w-full ">
        <div className="flex w-full h-full">
            <div className="w-1/5 h-full flex flex-col bg-gray-100 p-4 overflow-y-auto"> {/* Adjusted width to 20% */}
            <Link href={`/chat/${cuid()}`} >
                <Button>New chat</Button>
            </Link>
                <LeftMenu />
            </div>
            <div className="w-4/5 h-full  flex  flex-col bg-white p-4 shadow-lg items-center justify-center"> {/* Adjusted width to 80% and added some padding */}
              <div className="flex flex-col h-[80%] flex-1 w-full overflow-y-auto">
                  <Chatbot chat_id={id} init_messages={messages}/>
              </div>
            </div>
        
        </div>
      </main>
  );
}
